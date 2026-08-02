import { Injectable } from '@nestjs/common';
import {
  NotificationRecipientType,
  NotificationType,
  Prisma,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { pageMeta, toSkipTake } from '../common/pagination/pagination';
import { ListNotificationsQuery } from './notifications.schema';
import { mapNotification } from './notifications.mapper';

export type CreateNotificationInput = {
  recipientType?: NotificationRecipientType;
  staffId?: string;
  clientId?: string;
  staffRoles?: StaffRole[];
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async list(query: ListNotificationsQuery, user: AuthPrincipal) {
    const { page, limit, skip, take } = toSkipTake(query);

    const where: Prisma.NotificationWhereInput = this.recipientWhere(user);
    if (query.filter === 'unread') {
      where.readAt = null;
    }

    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: rows.map(mapNotification), meta: pageMeta(total, page, limit) };
  }

  async unreadCount(user: AuthPrincipal) {
    const count = await this.prisma.notification.count({
      where: { ...this.recipientWhere(user), readAt: null },
    });
    return { count };
  }

  async markRead(id: string, user: AuthPrincipal) {
    const row = await this.ensureOwned(id, user);
    if (row.readAt) return mapNotification(row);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return mapNotification(updated);
  }

  async markAllRead(user: AuthPrincipal) {
    const where = { ...this.recipientWhere(user), readAt: null };
    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Insert notification(s) for staff/client recipients and emit realtime event. */
  async createAndFanout(input: CreateNotificationInput) {
    const recipients = await this.resolveRecipients(input);
    if (recipients.length === 0) return [];

    const rows = await this.prisma.$transaction(
      recipients.map((r) =>
        this.prisma.notification.create({
          data: {
            recipientType: r.recipientType,
            staffId: r.staffId ?? null,
            clientId: r.clientId ?? null,
            type: input.type,
            title: input.title,
            body: input.body,
            data: (input.data ?? {}) as object,
          },
        }),
      ),
    );

    for (const row of rows) {
      const room =
        row.recipientType === 'staff' && row.staffId
          ? `user:${row.staffId}`
          : row.clientId
            ? `client:${row.clientId}`
            : undefined;
      this.realtime.emit('notification.new', mapNotification(row), room ? [room] : undefined);
    }

    return rows.map(mapNotification);
  }

  private async resolveRecipients(
    input: CreateNotificationInput,
  ): Promise<
    Array<{ recipientType: NotificationRecipientType; staffId?: string; clientId?: string }>
  > {
    if (input.staffRoles?.length) {
      const staff = await this.prisma.staffUser.findMany({
        where: {
          role: { in: input.staffRoles },
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      return staff.map((s) => ({
        recipientType: NotificationRecipientType.staff,
        staffId: s.id,
      }));
    }

    if (input.recipientType === 'staff' && input.staffId) {
      return [{ recipientType: NotificationRecipientType.staff, staffId: input.staffId }];
    }

    if (input.recipientType === 'client' && input.clientId) {
      return [{ recipientType: NotificationRecipientType.client, clientId: input.clientId }];
    }

    if (input.staffId) {
      return [{ recipientType: NotificationRecipientType.staff, staffId: input.staffId }];
    }
    if (input.clientId) {
      return [{ recipientType: NotificationRecipientType.client, clientId: input.clientId }];
    }

    return [];
  }

  private recipientWhere(user: AuthPrincipal): Prisma.NotificationWhereInput {
    if (user.type === 'client') {
      return { recipientType: 'client', clientId: user.sub };
    }
    return { recipientType: 'staff', staffId: user.sub };
  }

  private async ensureOwned(id: string, user: AuthPrincipal) {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row) {
      throw AppError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found');
    }

    if (user.type === 'client') {
      if (row.clientId !== user.sub) throw AppError.forbidden();
    } else if (row.staffId !== user.sub) {
      throw AppError.forbidden();
    }

    return row;
  }
}
