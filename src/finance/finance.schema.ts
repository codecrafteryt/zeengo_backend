import { z } from 'zod';

export const revenueByMethodQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type RevenueByMethodQuery = z.infer<typeof revenueByMethodQuerySchema>;
