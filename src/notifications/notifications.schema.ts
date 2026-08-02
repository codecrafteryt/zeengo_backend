import { z } from 'zod';
import { NotificationType } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listNotificationsQuerySchema = paginationSchema.extend({
  filter: z.enum(['all', 'unread']).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export { NotificationType };
