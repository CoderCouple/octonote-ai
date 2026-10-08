import { describe, expect, it } from "vitest";
import { toUser } from "../../../src/model/user.model";
import { toWorkspace } from "../../../src/model/workspace.model";

describe("model mappers", () => {
  it("toUser strips unknown row fields and preserves dates as Date", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const row = {
      id: "usr_a",
      name: "Sunil",
      email: "s@x.dev",
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
      // Drizzle adds metadata like __ph etc.; the mapper should not surface them.
      __phantom: true,
    } as never;
    const u = toUser(row);
    expect(u).toEqual({
      id: "usr_a",
      name: "Sunil",
      email: "s@x.dev",
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    expect("__phantom" in u).toBe(false);
  });

  it("toWorkspace shapes a workspace correctly", () => {
    const now = new Date();
    const row = {
      id: "wsp_a",
      name: "Acme",
      slug: "acme",
      createdAt: now,
      updatedAt: now,
    } as never;
    expect(toWorkspace(row).slug).toBe("acme");
  });
});
