/**
 * Product analytics (PostHog) sent from the API.
 *   - The key steps are sent once each, as the person who did them.
 *   - Never names, emails, titles or anything people wrote.
 *   - "Help improve Octonote" off means nothing is sent; no key means nothing either.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ProductAnalytics } from "../../src/common/product-analytics.service";
import { createHarness, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

/** Events are fire-and-forget; give them a moment to land. */
const settle = () => new Promise((r) => setTimeout(r, 30));
const events = () => h.posthog.sent.map((e) => e.event);

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  await settle();
});

describe("product analytics", () => {
  it("sends sign-up once, as the new person", async () => {
    expect(h.posthog.sent).toEqual([
      expect.objectContaining({ event: "signed_up", distinct_id: alice.id, properties: expect.objectContaining({ student: false }) }),
    ]);
    // Signing in again (the same account) is not a sign-up.
    await h.me.sync({ id: alice.id, email: alice.email, user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "" } as never);
    await settle();
    expect(events().filter((e) => e === "signed_up")).toHaveLength(1);
  });

  it("sends creating, sharing and publishing, without any content", async () => {
    h.posthog.sent.length = 0;
    const note = await h.pages.create(alice.workspaceId, { title: "Secret launch plan" }, alice.id);
    await h.shares.add({ resourceKind: "page", resourceId: note.id, email: "newperson@example.com", role: "viewer" }, alice);
    await h.settings.setPublished("page", note.id, true, alice.id);
    await settle();
    expect(h.posthog.sent.map((e) => [e.event, e.properties.kind ?? null])).toEqual([
      ["note_created", null],
      ["item_shared", "note"],
      ["item_published", "note"],
    ]);
    expect(h.posthog.sent[1]!.properties.toNewPerson).toBe(true);
    const wire = JSON.stringify(h.posthog.sent);
    expect(wire).not.toContain("Secret launch plan");
    expect(wire).not.toContain("@example.com");
    expect(wire).not.toContain("alice");
  });

  it("sends subscription changes as the workspace owner", async () => {
    h.posthog.sent.length = 0;
    const sub = {
      id: "sub_p",
      customer: "cus_p",
      status: "active",
      cancel_at_period_end: false,
      metadata: { workspaceId: alice.workspaceId },
      items: { data: [{ id: "si_p", price: { id: "price_year", recurring: { interval: "year" } }, current_period_end: 1_900_000_000 }] },
    };
    await h.billing.syncSubscription(sub as never);
    await h.billing.syncSubscription({ ...sub, cancel_at_period_end: true } as never);
    await settle();
    expect(h.posthog.sent.map((e) => [e.event, e.distinct_id, e.properties.interval])).toEqual([
      ["subscription_started", alice.id, "year"],
      ["subscription_cancel_scheduled", alice.id, "year"],
    ]);
  });

  it("sends nothing once someone turns off 'Help improve Octonote'", async () => {
    await h.preferences.update(alice.id, { analytics: false });
    h.posthog.sent.length = 0;
    await h.pages.create(alice.workspaceId, { title: "Quiet" }, alice.id);
    await settle();
    expect(h.posthog.sent).toEqual([]);

    await h.preferences.update(alice.id, { analytics: true });
    await h.pages.create(alice.workspaceId, { title: "Loud" }, alice.id);
    await settle();
    expect(events()).toEqual(["note_created"]);
  });

  it("is off without a PostHog key", async () => {
    const sent: unknown[] = [];
    const off = new ProductAnalytics(h.db, { key: null, host: "https://ph.test" }, async (_u, b) => {
      sent.push(b);
    });
    expect(off.enabled).toBe(false);
    await off.capture(alice.id, "note_created");
    expect(sent).toEqual([]);
  });

  it("never fails the action when PostHog is down", async () => {
    const down = new ProductAnalytics(h.db, { key: "phc_test", host: "https://ph.test" }, async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(down.capture(alice.id, "note_created")).resolves.toBeUndefined();
  });
});
