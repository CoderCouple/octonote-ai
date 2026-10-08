import { describe, expect, it } from "vitest";
import {
  PaginationParamsSchema,
  paginatedResult,
} from "../../../src/common/pagination";

describe("pagination", () => {
  it("schema coerces strings to numbers with defaults", () => {
    const parsed = PaginationParamsSchema.parse({});
    expect(parsed).toEqual({ limit: 50, offset: 0 });
    const explicit = PaginationParamsSchema.parse({ limit: "10", offset: "20" });
    expect(explicit).toEqual({ limit: 10, offset: 20 });
  });

  it("schema rejects negative offset and over-limit", () => {
    expect(() => PaginationParamsSchema.parse({ limit: 0 })).toThrow();
    expect(() => PaginationParamsSchema.parse({ offset: -1 })).toThrow();
    expect(() => PaginationParamsSchema.parse({ limit: 1000 })).toThrow();
  });

  it("paginatedResult computes hasMore correctly", () => {
    const r = paginatedResult([1, 2, 3], 50, { limit: 3, offset: 0 });
    expect(r.pagination.hasMore).toBe(true);
    const last = paginatedResult([1, 2, 3], 3, { limit: 3, offset: 0 });
    expect(last.pagination.hasMore).toBe(false);
  });
});
