import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';
import {
  BookingRequestStatus,
  BookingSource,
  BookingStatus,
} from '@prisma/client';

export const createBookingClientSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z
    .union([z.string().email(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  nationality: z
    .union([z.string(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const createBookingSchema = z.object({
  client: createBookingClientSchema,
  partySize: z.coerce.number().int().min(1),
  arrivalDate: z.string().date(),
  departureDate: z.string().date(),
  packageId: z.string().uuid(),
  totalAmount: z.coerce.number().min(0),
  internalNotes: z.string().optional(),
});

/** Customer website / app booking request (Option A). */
export const createCustomerBookingRequestSchema = z.object({
  client: createBookingClientSchema,
  partySize: z.coerce.number().int().min(1),
  childrenCount: z.coerce.number().int().min(0).optional().default(0),
  arrivalDate: z.string().date(),
  departureDate: z.string().date(),
  packageId: z.string().uuid().optional(),
  customerNotes: z.string().max(4000).optional(),
  idempotencyKey: z.string().min(8).max(128),
  source: z
    .enum(['customer_web', 'customer_app'])
    .optional()
    .default('customer_web'),
  requestedItems: z
    .array(
      z.object({
        kind: z.enum([
          'hotel',
          'activity',
          'restaurant',
          'guide',
          'car',
          'transfer',
          'train',
          'service',
        ]),
        vendorId: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        detail: z.string().max(500).optional(),
        serviceDate: z.string().date().optional(),
        quantity: z.coerce.number().int().min(1).optional().default(1),
        /** Structured selections; the server prices them, the client never does. */
        roomId: z.string().uuid().optional(),
        checkIn: z.string().date().optional(),
        checkOut: z.string().date().optional(),
        rooms: z.coerce.number().int().min(1).max(10).optional(),
        vehicleClassId: z.string().uuid().optional(),
        transferService: z.enum(['airport', 'hourly', 'day']).optional(),
        hours: z.coerce.number().int().min(1).max(24).optional(),
        trainRouteId: z.string().uuid().optional(),
        trainClass: z.string().max(60).optional(),
        pax: z.coerce.number().int().min(1).max(45).optional(),
        from: z.string().max(200).optional(),
        to: z.string().max(200).optional(),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  context: z
    .object({
      from: z.string().max(200).optional(),
      to: z.string().max(200).optional(),
      dateLabel: z.string().max(80).optional(),
    })
    .optional(),
});

export const listBookingsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(BookingStatus).optional(),
  requestStatus: z.nativeEnum(BookingRequestStatus).optional(),
  source: z.nativeEnum(BookingSource).optional(),
  customerRequests: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  view: z.enum(['full', 'codes']).optional(),
});

export const updateBookingSchema = z.object({
  partySize: z.coerce.number().int().min(1).optional(),
  arrivalDate: z.string().date().optional(),
  departureDate: z.string().date().optional(),
  packageId: z.string().uuid().optional(),
  totalAmount: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(BookingStatus).optional(),
  internalNotes: z.string().optional().nullable(),
  isVip: z.boolean().optional(),
});

export const reviewCustomerBookingSchema = z.object({
  requestStatus: z.enum(['under_review', 'confirmed', 'rejected']),
  rejectionReason: z.string().max(2000).optional(),
  reviewNotes: z.string().max(2000).optional(),
});

export const createChecklistItemSchema = z.object({
  title: z.string().min(1),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateChecklistItemSchema = z.object({
  title: z.string().min(1).optional(),
  isDone: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const createBookingNoteSchema = z.object({
  body: z.string().min(1),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
export type CreateCustomerBookingRequestDto = z.infer<
  typeof createCustomerBookingRequestSchema
>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type UpdateBookingDto = z.infer<typeof updateBookingSchema>;
export type ReviewCustomerBookingDto = z.infer<
  typeof reviewCustomerBookingSchema
>;
export type CreateChecklistItemDto = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemDto = z.infer<typeof updateChecklistItemSchema>;
export type CreateBookingNoteDto = z.infer<typeof createBookingNoteSchema>;
