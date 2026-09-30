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

const lang = z.enum(['en', 'ar', 'ru']).optional().default('en');

export const vendorListQuerySchema = catalogQuerySchema.extend({
  lang,
  category: z.string().trim().min(1).max(64).optional(),
  stars: z.coerce.number().int().min(1).max(5).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  withPhotos: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z
    .enum(['recommended', 'price_asc', 'price_desc', 'rating', 'stars', 'distance', 'name'])
    .optional()
    .default('recommended'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  checkIn: z.string().date().optional(),
  checkOut: z.string().date().optional(),
  rooms: z.coerce.number().int().min(1).max(10).optional(),
});

export type VendorListQuery = z.infer<typeof vendorListQuerySchema>;

export const vendorDetailQuerySchema = z.object({
  lang,
  people: z.coerce.number().int().min(1).max(20).optional(),
  checkIn: z.string().date().optional(),
  checkOut: z.string().date().optional(),
  rooms: z.coerce.number().int().min(1).max(10).optional(),
});

export type VendorDetailQuery = z.infer<typeof vendorDetailQuerySchema>;

export const transportQuerySchema = z.object({
  lang,
  service: z.enum(['airport', 'hourly', 'day']).optional().default('airport'),
  hours: z.coerce.number().int().min(1).max(24).optional().default(3),
  people: z.coerce.number().int().min(1).max(45).optional().default(2),
  bags: z.coerce.number().int().min(0).max(60).optional(),
  group: z.enum(['sedan', 'van', 'vip']).optional(),
});

export type TransportQuery = z.infer<typeof transportQuerySchema>;

export const trainsQuerySchema = z.object({
  lang,
  from: z.string().trim().min(1).max(120).optional(),
  to: z.string().trim().min(1).max(120).optional(),
  people: z.coerce.number().int().min(1).max(20).optional().default(1),
});

export type TrainsQuery = z.infer<typeof trainsQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
