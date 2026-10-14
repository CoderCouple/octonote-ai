/**
 * Promo codes and in-app billing management.
 *   - Free codes: Pro for N months, no card, granted by Octonote.
 *   - Discounts: checked by Octonote, applied through a Stripe coupon.
 *   - Rules: on/off, expiry, max uses, personal codes, once per workspace,
 *     one free code ever, not while already paying; DB constraints back them.
 *   - Admin: staff only, web sessions only.
 *   - Billing page: invoices, cancel / resume, monthly ⇄ yearly.
 */
import type { ExecutionContext } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminGuard } from "../../src/auth/admin.guard";
import { promoCodes, promoRedemptions } from "../../src/db/schemas/promotions";
import { users } from "../../src/db/schemas/users";
import { createHarness, statusOf, type Harness } from "./harness";

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

/** The `code` a refused promo error carries (PROMO_EXPIRED, …). */
async function refusal(p: Promise<unknown>): Promise<string | undefined> {
  const err = (await p.then(
    () => null,
    (e) => e,
  )) as { extra?: { code?: string }; getResponse?: () => unknown } | null;
  expect(err).not.toBeNull();
  return err?.extra?.code ?? (JSON.stringify(err?.getResponse?.() ?? err).match(/PROMO_[A-Z_]+/) ?? [])[0];
}

const freeCode = (code: string, extra: Record<string, unknown> = {}) =>
  h.promotions.create({ code, kind: "free_pro", audience: "creator", freeMonths: 6, ...extra } as never, admin.id);

async function becomePro(workspaceId: string) {
  const sub = {
    id: "sub_1",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspaceId },
    items: { data: [{ id: "si_1", price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
  };
  h.stripe.subscriptionsById.sub_1 = sub;
  await h.billing.syncSubscription(sub as never);
}

describe("database constraints", () => {
  it("reject codes whose fields don't match their kind", async () => {
    const bad = [
      { code: "lower", kind: "free_pro", freeMonths: 3 },
      { code: "TOOMUCH", kind: "percent_off", percentOff: 150, duration: "once" },
      { code: "MIXED", kind: "free_pro", freeMonths: 3, percentOff: 10 },
      { code: "NOMONTHS", kind: "percent_off", percentOff: 10, duration: "repeating" },
      { code: "FREEDUR", kind: "free_pro", freeMonths: 3, duration: "once" },
      { code: "UPPER", kind: "free_pro", freeMonths: 3, assignedEmail: "Sam@Example.com" },
    ];
    for (const values of bad) {
      await expect(h.db.insert(promoCodes).values(values as never), values.code).rejects.toThrow();
    }
  });
});

describe("free codes", () => {
  it("give Pro for N months with no card, lifting the limits", async () => {
    await freeCode("CREATOR6");
    for (let i = 0; i < 10; i++) await h.pages.create(alice.workspaceId, { title: `n${i}` }, alice.id);
    expect(await statusOf(h.pages.create(alice.workspaceId, { title: "11th" }, alice.id))).toBe(402);

    const res = await h.promotions.apply(alice.workspaceId, " creator6 ", alice.id);
    expect(res).toMatchObject({ kind: "free_pro", code: "CREATOR6", description: "Pro free for 6 months" });
    const months = (new Date((res as { proUntil: string }).proUntil).getTime() - Date.now()) / (30 * 86_400_000);
    expect(months).toBeGreaterThan(5.8);
    expect(months).toBeLessThan(6.2);

    expect(await h.planLimits.planDetails(alice.workspaceId)).toMatchObject({ plan: "pro", source: "promo" });
    await h.pages.create(alice.workspaceId, { title: "11th" }, alice.id);
    const summary = await h.billing.summary(alice.workspaceId, alice.id);
    expect(summary.promo).toEqual({ code: "CREATOR6", kind: "free_pro", description: "Pro free for 6 months", discount: null });
    const [code] = await h.db.select().from(promoCodes).where(eq(promoCodes.code, "CREATOR6"));
    expect(code!.redemptionCount).toBe(1);
  });

  it("end on the date, back to Free", async () => {
    await freeCode("SHORT", { freeMonths: 1 });
    await h.promotions.apply(alice.workspaceId, "SHORT", alice.id);
    await h.db.update(promoRedemptions).set({ proUntil: sql`now() - interval '1 minute'` });
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("free");
  });
});

describe("the rules", () => {
  it("unknown and switched-off codes look the same", async () => {
    const off = await freeCode("OFFCODE");
    await h.promotions.setEnabled(off.id, false);
    expect(await refusal(h.promotions.apply(alice.workspaceId, "NOSUCH", alice.id))).toBe("PROMO_INVALID");
    expect(await refusal(h.promotions.apply(alice.workspaceId, "OFFCODE", alice.id))).toBe("PROMO_INVALID");
  });

  it("expired codes, and codes that are used up", async () => {
    await freeCode("OLD", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
    expect(await refusal(h.promotions.apply(alice.workspaceId, "OLD", alice.id))).toBe("PROMO_EXPIRED");

    await freeCode("ONEUSE", { maxRedemptions: 1 });
    await h.promotions.apply(alice.workspaceId, "ONEUSE", alice.id);
    expect(await refusal(h.promotions.apply(bob.workspaceId, "ONEUSE", bob.id))).toBe("PROMO_USED_UP");
  });

  it("personal codes only work for their email", async () => {
    await freeCode("FORBOB", { assignedEmail: "bob@example.com" });
    expect(await refusal(h.promotions.apply(alice.workspaceId, "FORBOB", alice.id))).toBe("PROMO_NOT_YOURS");
    expect(await h.promotions.apply(bob.workspaceId, "FORBOB", bob.id)).toMatchObject({ kind: "free_pro" });
  });

  it("a workspace uses a code once, and one free code ever", async () => {
    await freeCode("FIRST");
    await freeCode("SECOND");
    await h.promotions.apply(alice.workspaceId, "FIRST", alice.id);
    expect(await refusal(h.promotions.apply(alice.workspaceId, "FIRST", alice.id))).toBe("PROMO_ALREADY_USED");
    expect(await refusal(h.promotions.apply(alice.workspaceId, "SECOND", alice.id))).toBe("PROMO_ONE_FREE");
  });

  it("no free code while the workspace already pays", async () => {
    await freeCode("PAYING");
    await becomePro(alice.workspaceId);
    expect(await refusal(h.promotions.apply(alice.workspaceId, "PAYING", alice.id))).toBe("PROMO_ALREADY_PAYING");
  });

  it("only owners and admins of the workspace can use a code", async () => {
    await freeCode("TEAM");
    expect(await statusOf(h.promotions.apply(alice.workspaceId, "TEAM", bob.id))).toBe(403);
  });

  it("the last use can't be taken twice at once", async () => {
    await freeCode("LAST", { maxRedemptions: 1 });
    const results = await Promise.allSettled([
      h.promotions.apply(alice.workspaceId, "LAST", alice.id),
      h.promotions.apply(bob.workspaceId, "LAST", bob.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [code] = await h.db.select().from(promoCodes).where(eq(promoCodes.code, "LAST"));
    expect(code!.redemptionCount).toBe(1);
  });
});

describe("discount codes", () => {
  it("create a matching Stripe coupon", async () => {
    const dto = await h.promotions.create(
      { code: "FOUNDER", kind: "percent_off", audience: "founder", percentOff: 40, duration: "forever", maxRedemptions: 100 } as never,
      admin.id,
    );
    expect(dto.description).toBe("40% off forever");
    expect(h.stripe.couponsCreated[0]).toMatchObject({ name: "FOUNDER", percent_off: 40, duration: "forever", max_redemptions: 100 });

    await h.promotions.create(
      { code: "FIVEOFF", kind: "amount_off", amountOffCents: 500, duration: "repeating", durationMonths: 3 } as never,
      admin.id,
    );
    expect(h.stripe.couponsCreated[1]).toMatchObject({ amount_off: 500, currency: "usd", duration: "repeating", duration_in_months: 3 });
    expect(await statusOf(h.promotions.create({ code: "FOUNDER", kind: "free_pro", freeMonths: 1 } as never, admin.id))).toBe(409);
  });

  it("are checked, applied at Checkout, and recorded once when it completes", async () => {
    await h.promotions.create({ code: "FOUNDER", kind: "percent_off", percentOff: 40, duration: "forever" } as never, admin.id);
    expect(await h.promotions.apply(alice.workspaceId, "founder", alice.id)).toEqual({
      kind: "percent_off",
      code: "FOUNDER",
      description: "40% off forever",
    });

    await h.billing.checkout(alice.workspaceId, "month", alice.id, "FOUNDER");
    const params = h.stripe.lastCheckout!;
    expect(params.discounts).toEqual([{ coupon: "coupon_1" }]);
    expect(params.allow_promotion_codes).toBeUndefined();
    const metadata = params.metadata as Record<string, string>;
    expect(metadata.workspaceId).toBe(alice.workspaceId);

    h.stripe.subscriptionsById.sub_7 = {
      id: "sub_7",
      customer: "cus_test",
      status: "active",
      cancel_at_period_end: false,
      metadata: { workspaceId: alice.workspaceId },
      items: { data: [{ id: "si_7", price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
    };
    const event = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_7", client_reference_id: alice.workspaceId, metadata } },
    });
    await h.billing.handleWebhook(event, "valid");
    await h.billing.handleWebhook(event, "valid"); // Stripe retries: still counted once.
    const [code] = await h.db.select().from(promoCodes).where(eq(promoCodes.code, "FOUNDER"));
    expect(code!.redemptionCount).toBe(1);
    expect((await h.billing.summary(alice.workspaceId, alice.id)).promo).toMatchObject({
      code: "FOUNDER",
      description: "40% off forever",
      discount: { percentOff: 40, amountOffCents: null },
    });
  });

  it("a one-off discount no longer counts toward the price after the first payment", async () => {
    await h.promotions.create({ code: "FIRSTPAY", kind: "amount_off", audience: "general", amountOffCents: 500, duration: "once" } as never, admin.id);
    await h.billing.checkout(alice.workspaceId, "month", alice.id, "FIRSTPAY");
    const metadata = h.stripe.lastCheckout!.metadata as Record<string, string>;
    h.stripe.subscriptionsById.sub_8 = {
      id: "sub_8",
      customer: "cus_test",
      status: "active",
      cancel_at_period_end: false,
      metadata: { workspaceId: alice.workspaceId },
      items: { data: [{ id: "si_8", price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
    };
    await h.billing.handleWebhook(
      JSON.stringify({ type: "checkout.session.completed", data: { object: { subscription: "sub_8", client_reference_id: alice.workspaceId, metadata } } }),
      "valid",
    );
    expect((await h.billing.summary(alice.workspaceId, alice.id)).promo).toMatchObject({ code: "FIRSTPAY", discount: null });
  });

  it("a free code can't be used at Checkout", async () => {
    await freeCode("FREEONLY");
    expect(await refusal(h.billing.checkout(alice.workspaceId, "month", alice.id, "FREEONLY"))).toBe("PROMO_NOT_A_DISCOUNT");
  });
});

describe("admin", () => {
  it("lists codes and who used them", async () => {
    const code = await freeCode("LISTED");
    await h.promotions.apply(alice.workspaceId, "LISTED", alice.id);
    expect((await h.promotions.list()).map((c) => c.code)).toContain("LISTED");
    const [r] = await h.promotions.redemptions(code.id);
    expect(r!.user?.email).toBe("alice@example.com");
    expect(r!.workspace?.id).toBe(alice.workspaceId);
    expect(r!.proUntil).toBeTruthy();
  });

  it("is staff only, and never through a CLI token", async () => {
    const guard = new AdminGuard(h.db);
    const ctx = (user: unknown) =>
      ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx({ id: admin.id }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx({ id: alice.id }))).rejects.toThrow(/Admins only/);
    await expect(guard.canActivate(ctx({ id: admin.id, cliTokenId: "tok_x" }))).rejects.toThrow(/Admins only/);
  });
});

describe("billing page", () => {
  it("lists invoices", async () => {
    await becomePro(alice.workspaceId);
    const [inv] = await h.billing.invoices(alice.workspaceId, alice.id);
    expect(inv).toMatchObject({ number: "OCT-0001", total: 600, status: "paid", pdfUrl: expect.stringContaining(".pdf") });
    expect(await statusOf(h.billing.invoices(alice.workspaceId, bob.id))).toBe(403);
  });

  it("cancels at the end of the period, and can undo it", async () => {
    await becomePro(alice.workspaceId);
    expect((await h.billing.setCancelAtPeriodEnd(alice.workspaceId, true, alice.id)).cancelAtPeriodEnd).toBe(true);
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("pro"); // Still Pro until the period ends.
    expect((await h.billing.setCancelAtPeriodEnd(alice.workspaceId, false, alice.id)).cancelAtPeriodEnd).toBe(false);
  });

  it("switches monthly ⇄ yearly with proration", async () => {
    await becomePro(alice.workspaceId);
    const summary = await h.billing.changeInterval(alice.workspaceId, "year", alice.id);
    expect(summary.interval).toBe("year");
    expect(h.stripe.lastSubscriptionUpdate?.params).toMatchObject({
      items: [{ id: "si_1", price: "price_year" }],
      proration_behavior: "always_invoice",
    });
    expect(await statusOf(h.billing.changeInterval(alice.workspaceId, "year", alice.id))).toBe(409);
  });
});
