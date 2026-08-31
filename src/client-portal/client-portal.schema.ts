import { z } from 'zod';
import { TaskStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listClientTasksQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(TaskStatus).optional(),
  filter: z.enum(['all', 'open', 'done']).optional().default('all'),
});

export type ListClientTasksQuery = z.infer<typeof listClientTasksQuerySchema>;
