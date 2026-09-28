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
