import { z } from 'zod';

export const nearbyPlacesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  section: z.enum(['under6', 'shortWalk', 'shortRide']).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  homeRail: z
    .enum(['moscowNow', 'closeToCentre', 'firstTime', 'withKids', 'food'])
    .optional(),
});

export type NearbyPlacesQuery = z.infer<typeof nearbyPlacesQuerySchema>;

export const destinationsQuerySchema = z.object({
  filter: z.string().trim().min(1).max(64).optional(),
});

export type DestinationsQuery = z.infer<typeof destinationsQuerySchema>;

export const catalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(64).optional(),
  people: z.coerce.number().int().min(1).max(20).optional(),
  date: z.string().trim().min(1).max(32).optional(),
  from: z.string().trim().min(1).max(120).optional(),
  to: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(120).optional().default(48),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
