import { z } from 'zod';
import { BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const CASH_METHODS = [
  'cash',
  'rajhi_transfer',
  'usdt_trc20',
  'usdt_bep20',
] as const;

const cashMethodSchema = z.enum(CASH_METHODS);

export const recordCashPaymentSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    znCode: z.string().min(2).max(32).optional(),
    amount: z.coerce.number().positive(),
    method: cashMethodSchema,
    location: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((value) => Boolean(value.bookingId || value.znCode?.trim()), {
    message: 'bookingId or znCode is required',
    path: ['znCode'],
  });

export const stripeAmountModeSchema = z.enum(['deposit', 'remaining', 'custom']);

export const createStripeLinkSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    znCode: z.string().min(2).max(32).optional(),
    amount: z.coerce.number().positive().optional(),
    amountMode: stripeAmountModeSchema.optional().default('remaining'),
    expiresInHours: z.coerce.number().int().min(1).max(720).optional(),
  })
  .refine((value) => Boolean(value.bookingId || value.znCode?.trim()), {
    message: 'bookingId or znCode is required',
    path: ['znCode'],
  });

export const listPaymentsHistoryQuerySchema = paginationSchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
});

export const listSplizerClientsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(BookingStatus).optional(),
});

export const listPaymentsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
});

export type RecordCashPaymentDto = z.infer<typeof recordCashPaymentSchema>;
export type CreateStripeLinkDto = z.infer<typeof createStripeLinkSchema>;
export type ListPaymentsHistoryQuery = z.infer<
  typeof listPaymentsHistoryQuerySchema
>;
export type ListSplizerClientsQuery = z.infer<typeof listSplizerClientsQuerySchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
