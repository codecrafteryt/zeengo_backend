import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  actorId: z.string().uuid().optional(),
  actorType: z.enum(['staff', 'client', 'system', 'webhook']).optional(),
  entity: z.string().min(1).max(64).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().min(1).max(80).optional(),
  from: z.string().min(8).max(40).optional(),
  to: z.string().min(8).max(40).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
