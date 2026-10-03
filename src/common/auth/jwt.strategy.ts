import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { StaffRole } from '@prisma/client';
import { AuthPrincipal } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.module';
import { AppError } from '../errors/app-error';
import {
  encodeStaffActiveCache,
  parseStaffActiveCache,
  STAFF_ACTIVE_CACHE_TTL_SECONDS,
  staffActiveCacheKey,
} from '../../auth/staff-session.policy';

type JwtPayload = {
  sub: string;
  type: 'staff' | 'client';
  role?: StaffRole;
  bookingId?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthPrincipal> {
    if (payload.type === 'staff') {
      const active = await this.staffIsActive(payload.sub);
      if (!active) {
        throw AppError.unauthorized('Account is inactive');
      }
    }
    return {
      sub: payload.sub,
      type: payload.type,
      role: payload.role,
      ...(payload.type === 'client' && payload.bookingId
        ? { bookingId: payload.bookingId }
        : {}),
    };
  }

  private async staffIsActive(staffId: string): Promise<boolean> {
    const key = staffActiveCacheKey(staffId);
    const cached = parseStaffActiveCache(await this.redis.get(key));
    if (cached !== null) return cached;
    const staff = await this.prisma.staffUser.findFirst({
      where: { id: staffId, deletedAt: null },
      select: { isActive: true },
    });
    const active = Boolean(staff?.isActive);
    await this.redis.set(
      key,
      encodeStaffActiveCache(active),
      STAFF_ACTIVE_CACHE_TTL_SECONDS,
    );
    return active;
  }
}
