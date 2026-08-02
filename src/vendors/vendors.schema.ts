import { z } from 'zod';
import { VendorType } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listVendorsQuerySchema = paginationSchema.extend({
  type: z.nativeEnum(VendorType).optional(),
  city: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createVendorSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(VendorType),
  city: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export const updateVendorSchema = createVendorSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assignVendorSchema = z.object({
  bookingId: z.string().uuid(),
  itineraryItemId: z.string().uuid().optional(),
  amount: z.number().min(0).optional(),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;
export type AssignVendorDto = z.infer<typeof assignVendorSchema>;

export { VendorType };
