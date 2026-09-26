import type { Response } from 'express';
import { paginationMeta, type PaginationQuery } from './pagination.js';

/**
 * Standard success envelope returned by all non-paginated endpoints.
 *
 * Usage:
 *   res.json(apiResponse(payload));
 *   res.status(201).json(apiResponse(payload));
 */
export function apiResponse<T>(data: T) {
  return { success: true as const, data };
}

/**
 * Alias for `apiResponse`. Some older controllers were written against this
 * name. Prefer `apiResponse` in new code; this exists so both spellings work
 * during the migration.
 */
export const sendSuccess = apiResponse;

/**
 * Paginated success envelope. Writes the response directly and returns it,
 * so `return sendPaginated(...)` is safe inside an async handler.
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  query: PaginationQuery,
  statusCode = 200,
) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: { pagination: paginationMeta(total, query) },
  });
}