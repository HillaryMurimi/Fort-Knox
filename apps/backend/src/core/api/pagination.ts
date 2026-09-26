import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]*$/).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginationMeta(total: number, query: PaginationQuery) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1 && totalPages > 0,
  };
}

export function paginationSkip(query: PaginationQuery): number {
  return (query.page - 1) * query.pageSize;
}
