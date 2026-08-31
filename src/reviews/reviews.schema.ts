import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';

export const listReviewsQuerySchema = paginationSchema.extend({
  driverId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  driverId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const reviewsStatsQuerySchema = z.object({
  driverId: z.string().uuid().optional(),
});

export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
export type CreateReviewDto = z.infer<typeof createReviewSchema>;
export type ReviewsStatsQuery = z.infer<typeof reviewsStatsQuerySchema>;
