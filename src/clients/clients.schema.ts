import { z } from 'zod';
import { paginationSchema } from '../common/pagination/pagination';

export const listClientsQuerySchema = paginationSchema;

const emptyToUndefined = z
  .union([z.string().email(), z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const createClientSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  email: emptyToUndefined,
  nationality: z
    .union([z.string(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  whatsapp: z
    .union([z.string(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  preferredLang: z.string().optional(),
});

export const updateClientSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z
    .union([z.string().email(), z.literal('')])
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v)),
  nationality: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  preferredLang: z.string().optional(),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type CreateClientDto = z.infer<typeof createClientSchema>;
export type UpdateClientDto = z.infer<typeof updateClientSchema>;
