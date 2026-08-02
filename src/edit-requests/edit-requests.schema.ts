import { z } from 'zod';
import { EditRequestStatus, EditRequestType } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const listEditRequestsQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(EditRequestStatus).optional(),
  type: z.nativeEnum(EditRequestType).optional(),
  bookingId: z.string().uuid().optional(),
});

export const createEditRequestSchema = z.object({
  type: z.nativeEnum(EditRequestType),
  requestedValue: z.string().optional(),
  originalValue: z.string().optional(),
  reason: z.string().optional(),
});

export const reviewEditRequestSchema = z.object({
  reviewNotes: z.string().optional(),
});

export type ListEditRequestsQuery = z.infer<typeof listEditRequestsQuerySchema>;
export type CreateEditRequestDto = z.infer<typeof createEditRequestSchema>;
export type ReviewEditRequestDto = z.infer<typeof reviewEditRequestSchema>;

export { EditRequestStatus, EditRequestType };
