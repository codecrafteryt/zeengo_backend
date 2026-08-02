import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';

export const listClientsQuerySchema = paginationSchema;

export const updateClientSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  nationality: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  preferredLang: z.string().optional(),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type UpdateClientDto = z.infer<typeof updateClientSchema>;
