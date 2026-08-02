import { Injectable } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors/app-error';
import { hashPassword } from '../common/crypto.util';
import { mapStaffUser } from './users.mapper';
import {
  CreateStaffUserInput,
  UpdateStaffUserInput,
} from './users.schema';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStaff(role?: StaffRole) {
    const users = await this.prisma.staffUser.findMany({
      where: {
        deletedAt: null,
        ...(role ? { role } : {}),
      },
      include: { driverProfile: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(mapStaffUser);
  }

  async getStats() {
    const grouped = await this.prisma.staffUser.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const byRole = Object.values(StaffRole).reduce(
      (acc, role) => {
        acc[role] = 0;
        return acc;
      },
      {} as Record<StaffRole, number>,
    );

    for (const row of grouped) {
      byRole[row.role] = row._count._all;
    }

    return {
      total: Object.values(byRole).reduce((sum, count) => sum + count, 0),
      byRole,
    };
  }

  async createStaff(actorId: string, input: CreateStaffUserInput) {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.staffUser.findUnique({ where: { email } });
    if (existing && !existing.deletedAt) {
      throw AppError.conflict('EMAIL_IN_USE', 'Email is already in use');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const staff = existing
        ? await tx.staffUser.update({
            where: { id: existing.id },
            data: {
              fullName: input.fullName,
              email,
              phone: input.phone,
              passwordHash,
              role: input.role,
              avatarUrl: input.avatarUrl,
              isActive: input.isActive ?? true,
              deletedAt: null,
            },
          })
        : await tx.staffUser.create({
            data: {
              fullName: input.fullName,
              email,
              phone: input.phone,
              passwordHash,
              role: input.role,
              avatarUrl: input.avatarUrl,
              isActive: input.isActive ?? true,
            },
          });

      if (input.role === StaffRole.driver) {
        await tx.driverProfile.upsert({
          where: { userId: staff.id },
          update: {},
          create: { userId: staff.id },
        });
      }

      return tx.staffUser.findUniqueOrThrow({
        where: { id: staff.id },
        include: { driverProfile: true },
      });
    });

    await this.audit.log({
      actorType: 'staff',
      actorId,
      action: 'users.create',
      entity: 'staff_users',
      entityId: user.id,
      diff: { role: user.role, email: user.email },
    });

    return mapStaffUser(user);
  }

  async updateStaff(
    actorId: string,
    id: string,
    input: UpdateStaffUserInput,
  ) {
    const existing = await this.prisma.staffUser.findFirst({
      where: { id, deletedAt: null },
      include: { driverProfile: true },
    });
    if (!existing) {
      throw AppError.notFound('USER_NOT_FOUND', 'User not found');
    }

    if (input.email && input.email.toLowerCase() !== existing.email) {
      const conflict = await this.prisma.staffUser.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (conflict && conflict.id !== id && !conflict.deletedAt) {
        throw AppError.conflict('EMAIL_IN_USE', 'Email is already in use');
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffUser.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined
            ? { email: input.email.toLowerCase() }
            : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.avatarUrl !== undefined
            ? { avatarUrl: input.avatarUrl }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });

      const nextRole = input.role ?? updated.role;
      if (nextRole === StaffRole.driver) {
        await tx.driverProfile.upsert({
          where: { userId: id },
          update: {},
          create: { userId: id },
        });
      }

      return tx.staffUser.findUniqueOrThrow({
        where: { id },
        include: { driverProfile: true },
      });
    });

    await this.audit.log({
      actorType: 'staff',
      actorId,
      action: 'users.update',
      entity: 'staff_users',
      entityId: id,
      diff: input,
    });

    return mapStaffUser(user);
  }

  async resetPassword(actorId: string, id: string, password: string) {
    const user = await this.prisma.staffUser.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw AppError.notFound('USER_NOT_FOUND', 'User not found');
    }

    await this.prisma.staffUser.update({
      where: { id },
      data: { passwordHash: await hashPassword(password) },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId,
      action: 'users.reset_password',
      entity: 'staff_users',
      entityId: id,
    });

    return { message: 'Password reset successfully' };
  }
}
