import { z } from 'zod';

export const activateVipSchema = z.object({
  bookingId: z.string().uuid(),
});

export const vipRequestSchema = z.object({
  reason: z.string().optional(),
});

export const escalateVipSchema = z.object({
  note: z.string().min(1).max(2000).optional(),
});

export type ActivateVipDto = z.infer<typeof activateVipSchema>;
export type VipRequestDto = z.infer<typeof vipRequestSchema>;
export type EscalateVipDto = z.infer<typeof escalateVipSchema>;
