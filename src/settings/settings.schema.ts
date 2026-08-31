import { z } from 'zod';

export const updateSettingSchema = z.object({
  value: z.unknown(),
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
