/** Admin → Explore over our own tables: group, split, filter, time buckets, staff. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ExploreQuery } from "@octonote/shared";
import { users } from "../../src/db/schemas/users";
import { timeBuckets } from "../../src/service/admin-explore.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

const q = (over: Partial<ExploreQuery>): ExploreQuery => ({
  dataset: "items",
  measure: "items",
  groupBy: "kind",
  splitBy: null,
  granularity: "day",
  days: 30,
  excludeStaff: false,
  filters: [],
  ...over,
});
const value = (r: { cells: { group: string; split: string | null; value: number }[] }, group: string, split: string | null = null) =>
  r.cells.find((c) => c.group === group && c.split === split)?.value ?? 0;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("team@octonote.ai");
  await h.pages.create(alice.workspaceId, { title: "A" }, alice.id);
  const published = await h.pages.create(alice.workspaceId, { title: "B" }, alice.id);
  await h.settings.setPublished("page", published.id, true, alice.id);
  await h.canvases.create(alice.workspaceId, { title: "C" }, alice.id);
  await h.projects.create(alice.workspaceId, { name: "P" }, alice.id);
  await h.pages.create(bob.workspaceId, { title: "Staff note" }, bob.id);
});

describe("explore", () => {
  it("groups by a dimension, largest first, with a total", async () => {
    const r = await h.adminExplore.explore(q({}));
    // 3 notes (incl. the project's own) + staff note, 2 canvases (incl. the project's), 1 project.
    expect(r.groups[0]).toBe("Note");
    expect(value(r, "Note")).toBe(4);
    expect(value(r, "Canvas")).toBe(2);
    expect(value(r, "Project")).toBe(1);
    expect(r.total).toBe(7);
  });

  it("splits, filters (slice) and drills down", async () => {
    const split = await h.adminExplore.explore(q({ splitBy: "published" }));
    expect(split.splits.sort()).toEqual(["Private", "Published"]);
    expect(value(split, "Note", "Published")).toBe(1);
    // Drill into notes: filter kind = Note, group by where they live.
    const drilled = await h.adminExplore.explore(q({ groupBy: "place", filters: [{ dim: "kind", op: "eq", value: "Note" }] }));
    expect(value(drilled, "Standalone")).toBe(3);
    expect(value(drilled, "In a project")).toBe(1);
    const notNotes = await h.adminExplore.explore(q({ filters: [{ dim: "kind", op: "neq", value: "Note" }] }));
    expect(notNotes.groups).not.toContain("Note");
  });

  it("buckets time by day, week or month and fills empty buckets", async () => {
    const days = await h.adminExplore.explore(q({ groupBy: "time", days: 7 }));
    expect(days.groups).toHaveLength(7);
    expect(days.cells.reduce((s, c) => s + c.value, 0)).toBe(7);
    const now = new Date("2026-10-29T12:00:00Z"); // a Thursday
    expect(timeBuckets("week", 7, now)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(timeBuckets("month", 90, now)[0]).toBe("2026-08-01");
  });

  it("leaves staff out when asked, and counts sign-ups by source", async () => {
    const all = await h.adminExplore.explore(q({ dataset: "signups", measure: "signups", groupBy: "email_domain" }));
    expect(value(all, "octonote.ai")).toBe(1);
    const real = await h.adminExplore.explore(q({ dataset: "signups", measure: "signups", groupBy: "email_domain", excludeStaff: true }));
    expect(real.groups).toEqual(["example.com"]);
    const items = await h.adminExplore.explore(q({ excludeStaff: true }));
    expect(value(items, "Note")).toBe(3);
    await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, alice.id));
    expect((await h.adminExplore.explore(q({ excludeStaff: true }))).total).toBe(0);
  });

  it("only accepts known names", async () => {
    for (const bad of [{ dataset: "users; drop table users" }, { groupBy: "email" }, { splitBy: "time" }, { filters: [{ dim: "uid", op: "eq" as const, value: "x" }] }, { days: 3 }])
      expect(await statusOf(h.adminExplore.explore(q(bad)))).toBe(400);
  });

  it("reports PostHog as unavailable without a read key", async () => {
    const r = await h.adminExplore.explore(q({ dataset: "traffic", measure: "visits", groupBy: "country" }));
    expect(r.error).toMatch(/PostHog/);
  });
});
