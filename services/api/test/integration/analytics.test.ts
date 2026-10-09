/**
 * View analytics for published pages: anonymous hourly counters, unique
 * visitors via a daily-rotating salted hash, bots and the item's own editors
 * ignored, readable only by owners and editors.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, statusOf, type Harness } from "./harness";

const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";
const anon = (ip: string, userAgent = SAFARI) => ({ userAgent, ip, userId: null });

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

async function publishedNote() {
  const note = await h.pages.create(alice.workspaceId, { title: "Guide" }, alice.id);
  await h.settings.setPublished("page", note.id, true, alice.id);
  return note;
}

describe("published page analytics", () => {
  it("counts views into hourly buckets and skips bots and link previews", async () => {
    const note = await publishedNote();
    const now = new Date("2026-10-09T15:30:00Z");
    await h.analytics.recordView("page", note.id, anon("1.1.1.1"), now);
    await h.analytics.recordView("page", note.id, anon("1.1.1.1"), now);
    await h.analytics.recordView("page", note.id, anon("2.2.2.2"), new Date("2026-10-09T13:05:00Z"));
    await h.analytics.recordView("page", note.id, anon("3.3.3.3", "Slackbot-LinkExpanding 1.0"), now);
    await h.analytics.recordView("page", note.id, anon("4.4.4.4", "Googlebot/2.1"), now);
    await h.analytics.recordView("page", note.id, { userAgent: undefined, ip: "5.5.5.5", userId: null }, now);

    const a = await h.analytics.get(alice.id, "page", note.id, "24h", now);
    expect(a.buckets).toHaveLength(24);
    expect(a.total).toBe(3);
    expect(a.buckets.at(-1)).toMatchObject({ views: 2, visitors: 1 });
    expect(a.buckets.at(-3)).toMatchObject({ views: 1, visitors: 1 });
    expect(a.visitors).toBe(2);
    expect(a.lastViewedAt?.toISOString()).toBe("2026-10-09T15:00:00.000Z");
  });

  it("counts a visitor once per day: same IP + browser is one person, a different browser is another", async () => {
    const note = await publishedNote();
    const day1 = new Date("2026-10-09T10:00:00Z");
    for (let i = 0; i < 4; i++) await h.analytics.recordView("page", note.id, anon("9.9.9.9"), day1);
    await h.analytics.recordView("page", note.id, anon("9.9.9.9", CHROME), day1);
    await h.analytics.recordView("page", note.id, anon("8.8.8.8"), day1);
    // The next day the salt rotates, so the same reader counts again.
    const day2 = new Date("2026-10-10T10:00:00Z");
    await h.analytics.recordView("page", note.id, anon("9.9.9.9"), day2);

    const a = await h.analytics.get(alice.id, "page", note.id, "7d", day2);
    expect(a.total).toBe(7);
    expect(a.visitors).toBe(4);
    expect(a.buckets.at(-2)).toMatchObject({ views: 6, visitors: 3 });
    expect(a.buckets.at(-1)).toMatchObject({ views: 1, visitors: 1 });
  });

  it("the same reader is a separate visitor on different pages", async () => {
    const a1 = await publishedNote();
    const a2 = await publishedNote();
    const now = new Date("2026-10-09T10:00:00Z");
    await h.analytics.recordView("page", a1.id, anon("7.7.7.7"), now);
    await h.analytics.recordView("page", a2.id, anon("7.7.7.7"), now);
    expect((await h.analytics.get(alice.id, "page", a1.id, "24h", now)).visitors).toBe(1);
    expect((await h.analytics.get(alice.id, "page", a2.id, "24h", now)).visitors).toBe(1);
  });

  it("signed-in readers count once a day by account, whatever their IP; owners and editors don't count", async () => {
    const note = await publishedNote();
    const carol = await h.signIn("carol@example.com");
    const now = new Date("2026-10-09T10:00:00Z");
    await h.analytics.recordView("page", note.id, { userAgent: SAFARI, ip: "1.1.1.1", userId: carol.id }, now);
    await h.analytics.recordView("page", note.id, { userAgent: CHROME, ip: "6.6.6.6", userId: carol.id }, now);
    // The owner reading their own published page isn't a reader.
    await h.analytics.recordView("page", note.id, { userAgent: SAFARI, ip: "1.1.1.1", userId: alice.id }, now);
    // Neither is an editor; a viewer is.
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" }, alice);
    await h.analytics.recordView("page", note.id, { userAgent: SAFARI, ip: "2.2.2.2", userId: bob.id }, now);

    const a = await h.analytics.get(alice.id, "page", note.id, "24h", now);
    expect(a.total).toBe(2);
    expect(a.visitors).toBe(1);
  });

  it("keeps only today's salt and hashes", async () => {
    const note = await publishedNote();
    await h.analytics.recordView("page", note.id, anon("1.1.1.1"), new Date("2026-10-09T10:00:00Z"));
    await h.analytics.recordView("page", note.id, anon("1.1.1.1"), new Date("2026-10-10T10:00:00Z"));
    const salts = await h.pg.query<{ day: string }>("select day::text as day from analytics_salts");
    const hashes = await h.pg.query("select day from visitor_hashes");
    expect(salts.rows.map((r) => r.day)).toEqual(["2026-10-10"]);
    expect(hashes.rows).toHaveLength(1);
  });

  it("compares with the previous period and groups by day, week and month", async () => {
    const note = await publishedNote();
    const now = new Date("2026-10-09T12:00:00Z");
    await h.analytics.recordView("page", note.id, anon("1.1.1.1"), new Date("2026-10-08T09:00:00Z"));
    await h.analytics.recordView("page", note.id, anon("2.2.2.2"), new Date("2026-10-08T18:00:00Z"));
    await h.analytics.recordView("page", note.id, anon("3.3.3.3"), new Date("2026-09-30T10:00:00Z"));

    const week = await h.analytics.get(alice.id, "page", note.id, "7d", now);
    expect(week.buckets.map((b) => b.views)).toEqual([0, 0, 0, 0, 0, 2, 0]);
    expect(week.previousTotal).toBe(1);
    expect(week.previousVisitors).toBe(1);

    const months = await h.analytics.get(alice.id, "page", note.id, "1y", now);
    expect(months.buckets).toHaveLength(12);
    expect(months.buckets.at(-1)).toMatchObject({ views: 2 });

    const weeks = await h.analytics.get(alice.id, "page", note.id, "6mo", now);
    expect(weeks.buckets.at(-1)!.start.toISOString()).toBe("2026-10-05T00:00:00.000Z"); // Monday
    expect(weeks.total).toBe(3);
  });

  it("only owners and editors can read a resource's analytics", async () => {
    const note = await publishedNote();
    expect(await statusOf(h.analytics.get(bob.id, "page", note.id, "7d"))).toBe(404);
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: bob.email, role: "viewer" }, alice);
    expect(await statusOf(h.analytics.get(bob.id, "page", note.id, "7d"))).toBe(403);
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: bob.email, role: "editor" }, alice);
    expect(await statusOf(h.analytics.get(bob.id, "page", note.id, "7d"))).toBe(200);
  });
});
