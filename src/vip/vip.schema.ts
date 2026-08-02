import { z } from 'zod';

export const activateVipSchema = z.object({
  bookingId: z.string().uuid(),
});

export const vipRequestSchema = z.object({
  reason: z.string().optional(),
});

export type ActivateVipDto = z.infer<typeof activateVipSchema>;
export type VipRequestDto = z.infer<typeof vipRequestSchema>;
