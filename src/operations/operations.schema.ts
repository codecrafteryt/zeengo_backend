import { z } from 'zod';
import { BookingStaffRole, ItineraryItemStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listOperationsQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});

export const upsertDayPlanSchema = z.object({
  dayNumber: z.coerce.number().int().min(1),
  planDate: z.string().date().optional(),
  carPlan: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createStaffLinkSchema = z.object({
  staffId: z.string().uuid(),
  role: z.nativeEnum(BookingStaffRole),
});

export const updateOpsItemSchema = z.object({
  status: z.nativeEnum(ItineraryItemStatus).optional(),
  carPlan: z.string().trim().max(500).nullable().optional(),
  meetingPoint: z.string().trim().max(300).nullable().optional(),
  guideContact: z.string().trim().max(120).nullable().optional(),
  pdfUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(2000).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  locationName: z.string().trim().max(300).nullable().optional(),
  startTime: z.string().optional().nullable(),
});

export type ListOperationsQuery = z.infer<typeof listOperationsQuerySchema>;
export type UpsertDayPlanDto = z.infer<typeof upsertDayPlanSchema>;
export type CreateStaffLinkDto = z.infer<typeof createStaffLinkSchema>;
export type UpdateOpsItemDto = z.infer<typeof updateOpsItemSchema>;
