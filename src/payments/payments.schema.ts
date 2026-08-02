import { z } from 'zod';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

const cashMethodSchema = z.enum(['cash', 'rajhi_transfer', 'usdt_trc20']);

export const recordCashPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  method: cashMethodSchema,
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const createStripeLinkSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  expiresInHours: z.coerce.number().int().min(1).max(720).optional(),
});

export const listPaymentsHistoryQuerySchema = paginationSchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
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
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
