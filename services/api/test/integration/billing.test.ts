/**
 * Free plan: 10 notes, 10 canvases, 10 projects and 10 notebooks per
 * workspace, and one workspace you own. Pro (from Stripe, via the webhook)
 * lifts both. Limits only apply once payments are set up.
 */
import { emailDomainSuffixes } from "@octonote/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

async function notes(n: number) {
  const made = [];
  for (let i = 0; i < n; i++) {
    made.push(await h.pages.create(alice.workspaceId, { title: `Note ${i}` }, alice.id));
  }
  return made;
}

/** What Stripe would send once Alice's checkout succeeds. */
async function becomePro(workspaceId = alice.workspaceId, status = "active") {
  await h.billing.syncSubscription({
    id: "sub_1",
    customer: "cus_test",
    status,
    cancel_at_period_end: false,
    metadata: { workspaceId },
    items: { data: [{ price: { recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
  } as never);
}

describe("free plan limits", () => {
  it("allows 10 notes, then refuses the 11th with PLAN_LIMIT (402)", async () => {
    await notes(10);
    const err = await h.pages
      .create(alice.workspaceId, { title: "One too many" }, alice.id)
      .catch((e: { code?: string; getStatus?: () => number }) => e);
    expect(err).toMatchObject({ code: "PLAN_LIMIT" });
    expect((err as { getStatus: () => number }).getStatus()).toBe(402);
  });

  it("counts each kind separately, and a project's own note and canvas don't count", async () => {
    for (let i = 0; i < 10; i++) await h.projects.create(alice.workspaceId, { name: `P${i}` }, alice.id);
    expect(await statusOf(h.projects.create(alice.workspaceId, { name: "P10" }, alice.id))).toBe(402);
    // Ten projects own ten notes and ten canvases, yet notes and canvases are untouched.
    expect(await statusOf(h.pages.create(alice.workspaceId, { title: "Free note" }, alice.id))).toBe(200);
    expect(await statusOf(h.canvases.create(alice.workspaceId, { title: "Free canvas" }, alice.id))).toBe(200);
  });

  it("frees a slot when you delete something", async () => {
    const made = await notes(10);
    await h.pages.softDelete(made[0]!.id, alice.id);
    expect(await statusOf(h.pages.create(alice.workspaceId, { title: "Again" }, alice.id))).toBe(200);
  });

  it("limits notebooks too", async () => {
    for (let i = 0; i < 10; i++) await h.notebooks.create(alice.workspaceId, { name: `NB${i}` }, alice.id);
    expect(await statusOf(h.notebooks.create(alice.workspaceId, { name: "NB10" }, alice.id))).toBe(402);
  });

  it("allows one owned workspace on Free; Pro allows more", async () => {
    expect(await statusOf(h.workspaces.create({ name: "Second" }, alice.id))).toBe(402);
    await becomePro();
    expect(await statusOf(h.workspaces.create({ name: "Second" }, alice.id))).toBe(200);
  });

  it("isn't enforced until payments are set up", async () => {
    const off = new PlanLimitsService(h.db, false);
    for (let i = 0; i < 12; i++) await h.pages.create(alice.workspaceId, { title: `N${i}` }, alice.id).catch(() => undefined);
    await expect(off.assertCanCreate(alice.workspaceId, "page")).resolves.toBeUndefined();
  });
});

describe("Pro", () => {
  it("lifts the limits while the subscription is active, and they return when it's cancelled", async () => {
    await notes(10);
    await becomePro();
    expect(await statusOf(h.pages.create(alice.workspaceId, { title: "Eleven" }, alice.id))).toBe(200);
    await becomePro(alice.workspaceId, "canceled");
    expect(await statusOf(h.pages.create(alice.workspaceId, { title: "Twelve" }, alice.id))).toBe(402);
  });

  it("summarises plan, usage and limits for the workspace", async () => {
    await notes(3);
    await h.projects.create(alice.workspaceId, { name: "Launch" }, alice.id);
    const free = await h.billing.summary(alice.workspaceId, alice.id);
    expect(free).toMatchObject({
      plan: "free",
      usage: { page: 3, canvas: 0, project: 1, notebook: 0 },
      limits: { page: 10, canvas: 10, project: 10, notebook: 10 },
      canManage: true,
    });
    await becomePro();
    const pro = await h.billing.summary(alice.workspaceId, alice.id);
    expect(pro).toMatchObject({ plan: "pro", limits: null, interval: "month", status: "active" });
    expect(await statusOf(h.billing.summary(alice.workspaceId, bob.id))).toBe(403);
  });
});

describe("Stripe checkout and webhook", () => {
  it("starts checkout for owners, tagging the subscription with the workspace", async () => {
    const { url } = await h.billing.checkout(alice.workspaceId, "year", alice.id);
    expect(url).toContain("checkout.stripe.test");
    expect(h.stripe.lastCheckout).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_year", quantity: 1 }],
      subscription_data: { metadata: { workspaceId: alice.workspaceId } },
    });
    expect(await statusOf(h.billing.checkout(alice.workspaceId, "month", bob.id))).toBe(403);
  });

  it("rejects webhooks with a bad signature", async () => {
    expect(await statusOf(h.billing.handleWebhook("{}", "forged"))).toBe(400);
    expect(await statusOf(h.billing.handleWebhook("{}", undefined))).toBe(400);
  });

  it("turns Pro on from checkout.session.completed and off from subscription.deleted", async () => {
    const sub = {
      id: "sub_9",
      customer: "cus_test",
      status: "active",
      cancel_at_period_end: false,
      metadata: { workspaceId: alice.workspaceId },
      items: { data: [{ price: { recurring: { interval: "year" } }, current_period_end: 1_900_000_000 }] },
    };
    h.stripe.subscriptionsById.sub_9 = sub;
    await h.billing.handleWebhook(
      JSON.stringify({ type: "checkout.session.completed", data: { object: { subscription: "sub_9" } } }),
      "valid",
    );
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("pro");

    await h.billing.handleWebhook(
      JSON.stringify({ type: "customer.subscription.deleted", data: { object: { ...sub, status: "canceled" } } }),
      "valid",
    );
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("free");
  });
});

describe("students", () => {
  it("splits an email into every suffix it could match", () => {
    expect(emailDomainSuffixes("Sam@CS.MIT.EDU")).toEqual(["cs.mit.edu", "mit.edu", "edu"]);
    expect(emailDomainSuffixes("no-at-sign")).toEqual([]);
  });

  it("only applies to emails ending in a whitelisted suffix, which can grow without a deploy", async () => {
    const lookalike = await h.signIn("sam@edu.example.com");
    expect(await h.planLimits.planOf(lookalike.workspaceId)).toBe("free");
    const aussieBefore = await h.signIn("kim@uni.edu.au");
    expect(await h.planLimits.planOf(aussieBefore.workspaceId)).toBe("free");

    await h.db.insert(schema.studentEmailSuffixes).values({ suffix: "edu.au", label: "Australia" });
    const aussie = await h.signIn("lee@uni.edu.au");
    expect(await h.planLimits.planOf(aussie.workspaceId)).toBe("pro");
  });

  it("ignores suffixes that are switched off", async () => {
    await h.db
      .update(schema.studentEmailSuffixes)
      .set({ enabled: false })
      .where(eq(schema.studentEmailSuffixes.suffix, "edu"));
    const sam = await h.signIn("sam@stanford.edu");
    expect(await h.planLimits.planOf(sam.workspaceId)).toBe("free");
  });

  it("get Pro free for a year from their first sign-in", async () => {
    const sam = await h.signIn("sam@stanford.edu");
    const summary = await h.billing.summary(sam.workspaceId, sam.id);
    expect(summary).toMatchObject({ plan: "pro", source: "student", limits: null });
    const until = new Date(summary.currentPeriodEnd!);
    const inAYear = new Date();
    inAYear.setMonth(inAYear.getMonth() + 12);
    expect(Math.abs(until.getTime() - inAYear.getTime())).toBeLessThan(60_000);

    for (let i = 0; i < 11; i++) await h.pages.create(sam.workspaceId, { title: `N${i}` }, sam.id);
    expect(await statusOf(h.workspaces.create({ name: "Thesis" }, sam.id))).toBe(200);
  });

  it("don't get a fresh year on later sign-ins, and drop to Free when it ends", async () => {
    const sam = await h.signIn("sam@stanford.edu");
    const past = new Date(Date.now() - 1000);
    await h.db.update(schema.users).set({ studentProUntil: past }).where(eq(schema.users.id, sam.id));
    // Signing in again must not restart the year.
    await h.me.sync({
      id: sam.id,
      email: sam.email,
      user_metadata: {},
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as never);
    expect(await h.planLimits.planOf(sam.workspaceId)).toBe("free");
  });

  it("is not given to other emails", async () => {
    expect((await h.billing.summary(alice.workspaceId, alice.id)).plan).toBe("free");
  });
});
