import { z } from 'zod';

export const createPackageSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  pricePerPerson: z.coerce.number().positive(),
  minPersons: z.coerce.number().int().min(1).default(1),
  durationDays: z.coerce.number().int().positive().optional(),
  description: z.string().optional(),
  inclusions: z.array(z.string()).default([]),
});

export const updatePackageSchema = createPackageSchema.partial();

export type CreatePackageDto = z.infer<typeof createPackageSchema>;
export type UpdatePackageDto = z.infer<typeof updatePackageSchema>;
