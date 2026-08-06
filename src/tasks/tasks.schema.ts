import { z } from 'zod';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listTasksQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignee: z.enum(['me']).optional(),
  bookingId: z.string().uuid().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  bookingId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().date().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.nativeEnum(TaskStatus).optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export { TaskPriority, TaskStatus };
