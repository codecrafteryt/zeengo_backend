import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorType: 'staff' | 'client' | 'system' | 'webhook';
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    diff?: unknown;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        diff: (params.diff ?? {}) as object,
      },
    });
  }
}
