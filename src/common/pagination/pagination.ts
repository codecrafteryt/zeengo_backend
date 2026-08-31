import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export function toSkipTake(query: PaginationQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function pageMeta(total: number, page: number, limit: number) {
  return { page, limit, total };
}

export function parseSort(
  sort: string | undefined,
  allowed: string[],
  fallback: { field: string; dir: 'asc' | 'desc' } = {
    field: 'createdAt',
    dir: 'desc',
  },
): Record<string, 'asc' | 'desc'> {
  if (!sort) return { [fallback.field]: fallback.dir };
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return { [fallback.field]: fallback.dir };
  return { [field]: desc ? 'desc' : 'asc' };
}
