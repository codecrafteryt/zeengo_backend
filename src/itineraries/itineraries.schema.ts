import { z } from 'zod';
import { ItineraryItemStatus } from '@prisma/client';

export const createItineraryItemSchema = z.object({
  dayNumber: z.coerce.number().int().min(1),
  itemDate: z.string().date().optional(),
  startTime: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  locationName: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  vendorId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  status: z.nativeEnum(ItineraryItemStatus).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateItineraryItemSchema = createItineraryItemSchema.partial();

const importItineraryItemSchema = z.object({
  time: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  locationName: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

export const importItinerarySchema = z.object({
  days: z.array(
    z.object({
      dayNumber: z.coerce.number().int().min(1),
      items: z.array(importItineraryItemSchema),
    }),
  ),
});

export const dailyOperationsQuerySchema = z.object({
  date: z.string().date(),
});

export const dailyOperationsWeekQuerySchema = z.object({
  start: z.string().date(),
});

export type CreateItineraryItemDto = z.infer<typeof createItineraryItemSchema>;
export type UpdateItineraryItemDto = z.infer<typeof updateItineraryItemSchema>;
export type ImportItineraryDto = z.infer<typeof importItinerarySchema>;
export type DailyOperationsQuery = z.infer<typeof dailyOperationsQuerySchema>;
export type DailyOperationsWeekQuery = z.infer<
  typeof dailyOperationsWeekQuerySchema
>;
