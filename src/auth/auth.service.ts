import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.module';
import { AuditService } from '../common/audit.service';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { AppError } from '../common/errors/app-error';
import {
  generateOtpCode,
  generateRefreshToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../common/crypto.util';
import { mapStaffUser } from '../users/users.mapper';

type TokenPayload = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
};

type FcmTokenEntry = {
  token: string;
  platform: string;
  updatedAt: string;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function ttlToSeconds(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 86400;
  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    default:
      return 30 * 86400;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async staffLogin(email: string, password: string) {
    const staff = await this.prisma.staffUser.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { driverProfile: true },
    });

    if (!staff || !staff.isActive) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const valid = await verifyPassword(staff.passwordHash, password);
    if (!valid) {
      throw AppError.unauthorized('Invalid email or password');
    }

    await this.prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens({
      sub: staff.id,
      type: 'staff',
      role: staff.role,
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: staff.id,
      action: 'auth.staff_login',
      entity: 'staff_users',
      entityId: staff.id,
    });

    return {
      ...tokens,
      user: mapStaffUser(staff),
    };
  }

  async clientRegister(input: {
    fullName: string;
    phone: string;
    password: string;
    email?: string;
    nationality?: string;
    preferredLang?: string;
  }) {
    const phone = input.phone.trim();
    const existing = await this.prisma.client.findUnique({ where: { phone } });

    if (existing?.phoneVerifiedAt && !existing.deletedAt) {
      throw AppError.conflict(
        'PHONE_ALREADY_REGISTERED',
        'Phone number is already registered',
      );
    }

    const passwordHash = await hashPassword(input.password);

    const client = existing
      ? await this.prisma.client.update({
          where: { id: existing.id },
          data: {
            fullName: input.fullName,
            email: input.email ?? existing.email,
            nationality: input.nationality ?? existing.nationality,
            preferredLang: input.preferredLang ?? existing.preferredLang,
            passwordHash,
            deletedAt: null,
          },
        })
      : await this.prisma.client.create({
          data: {
            fullName: input.fullName,
            phone,
            email: input.email,
            nationality: input.nationality,
            preferredLang: input.preferredLang ?? 'ar',
            passwordHash,
          },
        });

    await this.sendOtp(phone, OtpPurpose.register, client.id);

    return {
      message: 'OTP sent to phone',
      phone,
      expiresInSeconds: OTP_TTL_MS / 1000,
    };
  }

  async verifyOtp(phone: string, code: string, purpose: OtpPurpose) {
    const normalizedPhone = phone.trim();
    await this.consumeOtp(normalizedPhone, code, purpose);

    if (purpose === OtpPurpose.register) {
      const client = await this.prisma.client.findUnique({
        where: { phone: normalizedPhone },
      });
      if (!client || client.deletedAt) {
        throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
      }

      const verified = await this.prisma.client.update({
        where: { id: client.id },
        data: { phoneVerifiedAt: new Date() },
      });

      const tokens = await this.issueTokens({
        sub: verified.id,
        type: 'client',
      });

      await this.audit.log({
        actorType: 'client',
        actorId: verified.id,
        action: 'auth.client_register_verified',
        entity: 'clients',
        entityId: verified.id,
      });

      return {
        ...tokens,
        user: this.mapClient(verified),
      };
    }

    if (purpose === OtpPurpose.reset_password) {
      return {
        message: 'OTP verified. You may now reset your password.',
        phone: normalizedPhone,
      };
    }

    throw AppError.validation('Unsupported OTP purpose');
  }

  async clientLogin(phone: string, password: string) {
    const normalizedPhone = phone.trim();
    const client = await this.prisma.client.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!client || client.deletedAt) {
      throw AppError.unauthorized('Invalid phone or password');
    }
    if (!client.phoneVerifiedAt) {
      throw AppError.unauthorized('Phone number is not verified');
    }
    if (!client.passwordHash) {
      throw AppError.unauthorized('Invalid phone or password');
    }

    const valid = await verifyPassword(client.passwordHash, password);
    if (!valid) {
      throw AppError.unauthorized('Invalid phone or password');
    }

    const tokens = await this.issueTokens({
      sub: client.id,
      type: 'client',
    });

    await this.audit.log({
      actorType: 'client',
      actorId: client.id,
      action: 'auth.client_login',
      entity: 'clients',
      entityId: client.id,
    });

    return {
      ...tokens,
      user: this.mapClient(client),
    };
  }

  async forgotPassword(phone: string) {
    const normalizedPhone = phone.trim();
    const client = await this.prisma.client.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!client || client.deletedAt || !client.phoneVerifiedAt) {
      return {
        message: 'If the phone is registered, an OTP has been sent',
      };
    }

    await this.sendOtp(normalizedPhone, OtpPurpose.reset_password, client.id);

    return {
      message: 'If the phone is registered, an OTP has been sent',
    };
  }

  async resetPassword(phone: string, code: string, newPassword: string) {
    const normalizedPhone = phone.trim();
    await this.consumeOtp(normalizedPhone, code, OtpPurpose.reset_password);

    const client = await this.prisma.client.findUnique({
      where: { phone: normalizedPhone },
    });
    if (!client || client.deletedAt) {
      throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.client.update({
      where: { id: client.id },
      data: { passwordHash },
    });

    await this.audit.log({
      actorType: 'client',
      actorId: client.id,
      action: 'auth.password_reset',
      entity: 'clients',
      entityId: client.id,
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(
    principal: AuthPrincipal,
    currentPassword: string,
    newPassword: string,
  ) {
    if (principal.type === 'staff') {
      const staff = await this.prisma.staffUser.findFirst({
        where: { id: principal.sub, deletedAt: null, isActive: true },
      });
      if (!staff) throw AppError.notFound('USER_NOT_FOUND', 'User not found');

      const valid = await verifyPassword(staff.passwordHash, currentPassword);
      if (!valid) {
        throw AppError.unauthorized('Current password is incorrect');
      }

      await this.prisma.staffUser.update({
        where: { id: staff.id },
        data: { passwordHash: await hashPassword(newPassword) },
      });

      await this.audit.log({
        actorType: 'staff',
        actorId: staff.id,
        action: 'auth.password_change',
        entity: 'staff_users',
        entityId: staff.id,
      });

      return { message: 'Password changed successfully' };
    }

    const client = await this.prisma.client.findFirst({
      where: { id: principal.sub, deletedAt: null },
    });
    if (!client || !client.passwordHash) {
      throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
    }

    const valid = await verifyPassword(client.passwordHash, currentPassword);
    if (!valid) {
      throw AppError.unauthorized('Current password is incorrect');
    }

    await this.prisma.client.update({
      where: { id: client.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    await this.audit.log({
      actorType: 'client',
      actorId: client.id,
      action: 'auth.password_change',
      entity: 'clients',
      entityId: client.id,
    });

    return { message: 'Password changed successfully' };
  }

  async refresh(refreshToken: string) {
    const hash = hashToken(refreshToken);
    const key = `refresh:${hash}`;
    const payload = await this.redis.getJson<TokenPayload>(key);
    if (!payload) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    await this.redis.del(key);

    if (payload.type === 'staff') {
      const staff = await this.prisma.staffUser.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
      });
      if (!staff) {
        throw AppError.unauthorized('Invalid or expired refresh token');
      }
      payload.role = staff.role;
    } else {
      const client = await this.prisma.client.findFirst({
        where: { id: payload.sub, deletedAt: null },
      });
      if (!client || !client.phoneVerifiedAt) {
        throw AppError.unauthorized('Invalid or expired refresh token');
      }
    }

    return this.issueTokens(payload);
  }

  async logout(refreshToken: string) {
    const hash = hashToken(refreshToken);
    await this.redis.del(`refresh:${hash}`);
    return { message: 'Logged out successfully' };
  }

  async me(principal: AuthPrincipal) {
    if (principal.type === 'staff') {
      const staff = await this.prisma.staffUser.findFirst({
        where: { id: principal.sub, deletedAt: null },
        include: { driverProfile: true },
      });
      if (!staff) {
        throw AppError.notFound('USER_NOT_FOUND', 'User not found');
      }
      return { type: 'staff' as const, user: mapStaffUser(staff) };
    }

    const client = await this.prisma.client.findFirst({
      where: { id: principal.sub, deletedAt: null },
    });
    if (!client) {
      throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
    }
    return { type: 'client' as const, user: this.mapClient(client) };
  }

  async upsertFcmToken(
    principal: AuthPrincipal,
    token: string,
    platform: string,
  ) {
    if (principal.type !== 'client') {
      throw AppError.forbidden('FCM tokens are only supported for clients');
    }

    const client = await this.prisma.client.findFirst({
      where: { id: principal.sub, deletedAt: null },
    });
    if (!client) {
      throw AppError.notFound('CLIENT_NOT_FOUND', 'Client not found');
    }

    const existing = (client.fcmTokens as FcmTokenEntry[]) ?? [];
    const entry: FcmTokenEntry = {
      token,
      platform,
      updatedAt: new Date().toISOString(),
    };
    const index = existing.findIndex((item) => item.platform === platform);
    if (index >= 0) existing[index] = entry;
    else existing.push(entry);

    await this.prisma.client.update({
      where: { id: client.id },
      data: { fcmTokens: existing },
    });

    return { message: 'FCM token saved' };
  }

  private async issueTokens(payload: TokenPayload) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: payload.sub,
        type: payload.type,
        ...(payload.role ? { role: payload.role } : {}),
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as '15m',
      },
    );

    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const ttlSeconds = ttlToSeconds(
      this.config.get<string>('JWT_REFRESH_TTL', '30d'),
    );

    await this.redis.setJson(`refresh:${refreshHash}`, payload, ttlSeconds);

    return { accessToken, refreshToken };
  }

  private async sendOtp(
    phone: string,
    purpose: OtpPurpose,
    clientId?: string,
  ) {
    const code = generateOtpCode();
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash,
        purpose,
        expiresAt,
        clientId: clientId ?? null,
      },
    });

    if (this.config.get<string>('NODE_ENV') === 'development') {
      this.logger.log(`[DEV OTP] phone=${phone} purpose=${purpose} code=${code}`);
    }
  }

  private async consumeOtp(phone: string, code: string, purpose: OtpPurpose) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });

    if (!otp) {
      throw AppError.validation('Invalid or expired OTP');
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw AppError.validation('Too many OTP attempts');
    }

    if (hashToken(code) !== otp.codeHash) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw AppError.validation('Invalid OTP code');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    return otp;
  }

  private mapClient(client: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    nationality: string | null;
    whatsapp: string | null;
    phoneVerifiedAt: Date | null;
    emailVerifiedAt: Date | null;
    preferredLang: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: client.id,
      fullName: client.fullName,
      phone: client.phone,
      email: client.email,
      nationality: client.nationality,
      whatsapp: client.whatsapp,
      phoneVerifiedAt: client.phoneVerifiedAt?.toISOString() ?? null,
      emailVerifiedAt: client.emailVerifiedAt?.toISOString() ?? null,
      preferredLang: client.preferredLang,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }
}
