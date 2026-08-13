import { z } from 'zod';
import {
  VendorBookingStatus,
  VendorPaymentTerms,
  VendorType,
} from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const listVendorsQuerySchema = paginationSchema.extend({
  type: z.nativeEnum(VendorType).optional(),
  city: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.nativeEnum(VendorType),
  city: z.preprocess(emptyToUndefined, z.string().trim().max(80).optional()),
  contactName: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120).optional(),
  ),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  paymentTerms: z.nativeEnum(VendorPaymentTerms).optional(),
  cancellationPolicy: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(2000).optional(),
  ),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
});

export const updateVendorSchema = createVendorSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assignVendorSchema = z.object({
  bookingId: z.string().uuid(),
  itineraryItemId: z.string().uuid().optional(),
  serviceDate: z.string().date().optional(),
  pax: z.coerce.number().int().min(1).max(200).optional(),
  details: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
  amount: z.coerce.number().min(0).optional(),
  appendItinerary: z.boolean().optional().default(true),
});

export const updateVendorBookingSchema = z.object({
  status: z.nativeEnum(VendorBookingStatus).optional(),
  amount: z.coerce.number().min(0).optional(),
  pax: z.coerce.number().int().min(1).max(200).optional(),
  details: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
  serviceDate: z.string().date().optional(),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;
export type AssignVendorDto = z.infer<typeof assignVendorSchema>;
export type UpdateVendorBookingDto = z.infer<typeof updateVendorBookingSchema>;

export { VendorType, VendorBookingStatus, VendorPaymentTerms };
