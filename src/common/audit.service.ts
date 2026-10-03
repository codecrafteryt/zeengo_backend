import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorType: 'staff' | 'client' | 'system' | 'webhook';
    actorId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    diff?: unknown;
  }) {
    try {
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
    } catch (err) {
      this.logger.error(
        `Audit write failed for ${params.action}: ${(err as Error).message}`,
      );
    }
  }
}
