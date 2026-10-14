/**
 * Tracking and the admin dashboard's numbers.
 *   - Activity: one row per user, day and source; which app a request came from.
 *   - Subscription history from the webhook, counted once despite retries.
 *   - Metrics: growth, revenue (after discounts), codes, usage.
 */
import { describe, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { activitySource } from "../../src/common/activity.service";
import { activityDays, billingEvents } from "../../src/db/schemas/tracking";
import { users } from "../../src/db/schemas/users";
import { billingChanges } from "../../src/service/billing.service";
import { createHarness, type Harness } from "./harness";

let h: Harness;
let admin: Awaited<ReturnType<Harness["signIn"]>>;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  admin = await h.signIn("staff@octonote.ai");
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id));
});

function subscription(id: string, workspaceId: string, over: Record<string, unknown> = {}, interval = "month") {
  return {
    id,
    customer: `cus_${id}`,
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspaceId },
    items: { data: [{ id: `si_${id}`, price: { id: `price_${interval}`, recurring: { interval } }, current_period_end: 1_900_000_000 }] },
    ...over,
  };
}

async function eventsFor(workspaceId: string) {
  const rows = await h.db.select().from(billingEvents).where(eq(billingEvents.workspaceId, workspaceId));
  return rows.map((r) => r.kind).sort();
}

describe("activity", () => {
  it("records a user once per day and source", async () => {
    await h.activity.record(alice.id, "web");
    await h.activity.record(alice.id, "web");
    await h.activity.record(alice.id, "cli");
    await h.activity.record(alice.id, "web", new Date(Date.now() + 86_400_000));
    const rows = await h.db.select().from(activityDays).where(eq(activityDays.userId, alice.id));
    expect(rows.map((r) => r.source).sort()).toEqual(["cli", "web", "web"]);
  });

  it("tells the apps apart", () => {
    expect(activitySource({ cliTokenId: "tok_1" }, { "x-octonote-client": "mobile" })).toBe("cli");
    expect(activitySource({}, { "x-octonote-client": "mobile" })).toBe("mobile");
    expect(activitySource({}, { "x-octonote-client": "anything" })).toBe("web");
    expect(activitySource({}, {})).toBe("web");
  });

  it("never fails the request it rides on", async () => {
    await expect(h.activity.record("usr_missing", "web")).resolves.toBeUndefined();
  });
});

describe("subscription history", () => {
  it("follows a subscription from start to end, once per change", async () => {
    const ws = alice.workspaceId;
    await h.billing.syncSubscription(subscription("sub_a", ws) as never);
    await h.billing.syncSubscription(subscription("sub_a", ws) as never); // our call + Stripe's webhook
    await h.billing.syncSubscription(subscription("sub_a", ws, { cancel_at_period_end: true }) as never);
    await h.billing.syncSubscription(subscription("sub_a", ws) as never);
    await h.billing.syncSubscription(subscription("sub_a", ws, {}, "year") as never);
    await h.billing.syncSubscription(subscription("sub_a", ws, { status: "past_due" }, "year") as never);
    await h.billing.syncSubscription(subscription("sub_a", ws, { status: "canceled" }, "year") as never);
    await h.billing.syncSubscription(subscription("sub_a", ws, { status: "canceled" }, "year") as never);
    expect(await eventsFor(ws)).toEqual(
      ["cancel_scheduled", "ended", "interval_changed", "past_due", "resumed", "started"].sort(),
    );
  });

  it("treats a new subscription after an old one ended as a new start", () => {
    const ended = { stripeSubscriptionId: "sub_old", status: "canceled", interval: "month", cancelAtPeriodEnd: false };
    expect(billingChanges(ended, { stripeSubscriptionId: "sub_new", status: "active", interval: "month", cancelAtPeriodEnd: false })).toEqual(["started"]);
    expect(billingChanges(null, { stripeSubscriptionId: "sub_new", status: "incomplete", interval: "month", cancelAtPeriodEnd: false })).toEqual([]);
  });

  it("records failed payments from the webhook, once per Stripe event", async () => {
    await h.billing.syncSubscription(subscription("sub_f", bob.workspaceId) as never);
    const event = JSON.stringify({
      id: "evt_fail_1",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_sub_f", amount_due: 1000 } },
    });
    await h.billing.handleWebhook(event, "valid");
    await h.billing.handleWebhook(event, "valid");
    const failed = await h.db.select().from(billingEvents).where(eq(billingEvents.kind, "payment_failed"));
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ workspaceId: bob.workspaceId, amountCents: 1000 });
  });
});

describe("metrics", () => {
  it("counts growth, revenue after discounts, codes and usage", async () => {
    // Activity: alice on web + mobile today, bob through the CLI.
    await h.activity.record(alice.id, "web");
    await h.activity.record(alice.id, "mobile");
    await h.activity.record(bob.id, "cli");

    // Revenue: alice pays monthly with 50% off forever; bob pays yearly at list price.
    await h.promotions.create(
      { code: "HALF", kind: "percent_off", audience: "founder", percentOff: 50, duration: "forever" } as never,
      admin.id,
    );
    await h.billing.checkout(alice.workspaceId, "month", alice.id, "HALF");
    const metadata = h.stripe.lastCheckout!.metadata as Record<string, string>;
    h.stripe.subscriptionsById.sub_h = subscription("sub_h", alice.workspaceId);
    await h.billing.handleWebhook(
      JSON.stringify({ type: "checkout.session.completed", data: { object: { subscription: "sub_h", client_reference_id: alice.workspaceId, metadata } } }),
      "valid",
    );
    await h.billing.syncSubscription(subscription("sub_y", bob.workspaceId, {}, "year") as never);

    // Usage: two notes and a canvas.
    await h.pages.create(alice.workspaceId, { title: "One" }, alice.id);
    await h.pages.create(alice.workspaceId, { title: "Two" }, alice.id);
    await h.canvases.create(bob.workspaceId, { title: "Board" }, bob.id);

    const m = await h.adminMetrics.metrics(30);

    expect(m.growth).toMatchObject({ users: 3, workspaces: 3, signups: 3, active: { day: 2, week: 2, month: 2 } });
    expect(m.growth.bySource).toEqual({ web: 1, mobile: 1, cli: 1 });
    expect(m.growth.series).toHaveLength(30);
    expect(m.growth.series.at(-1)).toMatchObject({ signups: 3, active: 2 });

    // $5 (alice) + $100/12 (bob) = 500 + 833 cents.
    expect(m.revenue).toMatchObject({ mrrCents: 1333, paying: 2, monthly: 1, yearly: 1, started: 2, ended: 0 });
    expect(m.revenue.conversion).toEqual({ workspaces: 3, paying: 2 });

    expect(m.codes).toMatchObject({ redemptions: 1, discountMonthlyCents: 500 });
    expect(m.codes.byAudience).toEqual([{ audience: "founder", redemptions: 1 }]);
    expect(m.codes.top[0]).toMatchObject({ code: "HALF", uses: 1, usesInRange: 1, description: "50% off forever" });

    expect(m.usage.totals).toEqual({ note: 2, canvas: 1, project: 0, notebook: 0 });
    expect(m.usage.created.note).toBe(2);
    expect(m.usage.cliUsers).toBe(1);
  });

  it("is empty but well-formed on a fresh database", async () => {
    const fresh = await createHarness();
    const m = await fresh.adminMetrics.metrics(7);
    expect(m.growth.series).toHaveLength(7);
    expect(m.revenue.mrrCents).toBe(0);
    expect(m.codes.top).toEqual([]);
    expect(m.usage.published).toBe(0);
  });
});
