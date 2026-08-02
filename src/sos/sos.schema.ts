import { z } from 'zod';
import { SosStatus } from '@prisma/client';
import { paginationSchema } from '../common/pagination/pagination';

export const createSosSchema = z.object({
  message: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const listSosQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(SosStatus).optional(),
});

export type CreateSosDto = z.infer<typeof createSosSchema>;
export type ListSosQuery = z.infer<typeof listSosQuerySchema>;

export { SosStatus };
