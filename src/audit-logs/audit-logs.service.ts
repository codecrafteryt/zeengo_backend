import { Injectable } from '@nestjs/common';
import { Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import type { ListAuditLogsQuery } from './audit-logs.schema';

const ALLOWED: StaffRole[] = [StaffRole.admin, StaffRole.ops_manager];

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQuery, user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !ALLOWED.includes(user.role)) {
      throw AppError.forbidden();
    }

    const { page, limit, skip, take } = toSkipTake(query);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.actorType) where.actorType = query.actorType;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: String(row.id),
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        diff: row.diff,
      })),
      meta: pageMeta(total, page, limit),
    };
  }
}
