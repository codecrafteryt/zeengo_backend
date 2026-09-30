import { z } from 'zod';
import {
  VendorBookingStatus,
  VendorPaymentTerms,
  VendorType,
} from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const queryBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const listVendorsQuerySchema = paginationSchema.extend({
  type: z.nativeEnum(VendorType).optional(),
  city: z.string().optional(),
  isActive: queryBoolean,
  isPublished: queryBoolean,
});

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? null : value,
    z.string().trim().max(max).nullable().optional(),
  );

const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'Must be an http(s) URL');

/** Website listing fields; `null` clears a value. */
const publicCatalogFields = {
  nameEn: optionalText(160),
  nameAr: optionalText(160),
  nameRu: optionalText(160),
  summary: optionalText(4000),
  summaryAr: optionalText(4000),
  address: optionalText(300),
  area: optionalText(120),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  stars: z.coerce.number().int().min(1).max(5).nullable().optional(),
  images: z.array(httpUrl).max(20).optional(),
  priceFrom: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  priceCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code')
    .optional(),
  priceUnit: z.enum(['night', 'person', 'hour', 'trip']).nullable().optional(),
  category: optionalText(80),
  durationLabel: optionalText(80),
  languages: optionalText(200),
  website: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? null : value,
    httpUrl.nullable().optional(),
  ),
  yandexMapsUrl: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? null : value,
    httpUrl.nullable().optional(),
  ),
  isPublished: z.boolean().optional(),
};

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
  ...publicCatalogFields,
});

export const updateVendorSchema = createVendorSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assignVendorSchema = z.object({
  bookingId: z.string().uuid(),
  itineraryItemId: z.string().uuid().optional(),
  serviceDate: z.string().date().optional(),
  pax: z.coerce.number().int().min(1).max(200).optional(),
  details: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(1000).optional(),
  ),
  amount: z.coerce.number().min(0).optional(),
  appendItinerary: z.boolean().optional().default(true),
});

export const updateVendorBookingSchema = z.object({
  status: z.nativeEnum(VendorBookingStatus).optional(),
  amount: z.coerce.number().min(0).optional(),
  pax: z.coerce.number().int().min(1).max(200).optional(),
  details: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(1000).optional(),
  ),
  serviceDate: z.string().date().optional(),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
export type CreateVendorDto = z.infer<typeof createVendorSchema>;
export type UpdateVendorDto = z.infer<typeof updateVendorSchema>;
export type AssignVendorDto = z.infer<typeof assignVendorSchema>;
export type UpdateVendorBookingDto = z.infer<typeof updateVendorBookingSchema>;

export { VendorType, VendorBookingStatus, VendorPaymentTerms };
