/**
 * Supabase serves every `public` table over its Data API with the public anon
 * key. All app data must go through services/api instead, so every table needs
 * RLS on (with no policies). A table added without it fails here.
 */
import { describe, expect, it } from "vitest";
import { createHarness } from "./harness";

describe("database lockdown", () => {
  it("every public table has row-level security enabled", async () => {
    const h = await createHarness();
    const { rows } = await h.pg.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });
});
