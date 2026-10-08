/**
 * Shared pagination contract.
 *
 *   GET ...?limit=20&offset=40   →   PaginationParams
 *   { result: { items, pagination } }   ←   PaginatedResult
 */
import { z } from "zod";

export const PaginationParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResult<T> {
  return {
    items,
    pagination: {
      limit: params.limit,
      offset: params.offset,
      total,
      hasMore: params.offset + items.length < total,
    },
  };
}
