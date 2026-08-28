import { z } from 'zod';

export const rejectAssignmentSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type RejectAssignmentDto = z.infer<typeof rejectAssignmentSchema>;
