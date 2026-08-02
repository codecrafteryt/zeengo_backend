import { Notification } from '@prisma/client';

export type NotificationDto = {
  id: string;
  recipientType: string;
  staffId: string | null;
  clientId: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export function mapNotification(row: Notification): NotificationDto {
  return {
    id: row.id,
    recipientType: row.recipientType,
    staffId: row.staffId,
    clientId: row.clientId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: (row.data as Record<string, unknown>) ?? {},
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
