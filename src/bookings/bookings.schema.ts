import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';
import { BookingStatus } from '@prisma/client';

export const createBookingClientSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  nationality: z.string().optional(),
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

export const listBookingsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(BookingStatus).optional(),
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
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type UpdateBookingDto = z.infer<typeof updateBookingSchema>;
export type CreateChecklistItemDto = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemDto = z.infer<typeof updateChecklistItemSchema>;
export type CreateBookingNoteDto = z.infer<typeof createBookingNoteSchema>;
