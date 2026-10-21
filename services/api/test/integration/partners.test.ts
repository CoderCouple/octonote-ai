/**
 * Partners (creators and influencers).
 *   - A unique code from the name: PRIYA, then PRIYA2; never one a promo code uses.
 *   - Their audience code is a normal promo code with the same name.
 *   - People become theirs through the link (?ref=priya) or the code; the first partner wins.
 *   - Paid invoices earn the partner their share, inside the commission window, once per invoice.
 *   - Stats and payouts.
 */
import { PartnerCreateSchema } from "@octonote/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { partnerReferrals } from "../../src/db/schemas/partners";
import { users } from "../../src/db/schemas/users";
import { codeStem } from "../../src/service/partners.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let admin: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  admin = await h.signIn("staff@octonote.ai");
  await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id));
});

const create = (input: Record<string, unknown>) => h.partners.create(PartnerCreateSchema.parse(input), admin.id);

const supabaseUser = (n: number, email: string) =>
  ({
    id: `usr_00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`,
    email,
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  }) as never;

/** Signs a brand-new person up the way the web app does, with the ref cookie's value. */
async function signUpWithRef(n: number, ref: string | null) {
  const me = await h.me.sync(supabaseUser(n, `reader${n}@example.com`), { signupRef: ref });
  return { id: me.user.id, workspaceId: me.memberships[0]!.workspace.id };
}

async function referralOf(userId: string) {
  const [row] = await h.db.select().from(partnerReferrals).where(eq(partnerReferrals.userId, userId));
  return row ?? null;
}

/** Makes the workspace a Stripe customer, then sends a paid invoice through the webhook. */
async function paidInvoice(workspaceId: string, invoiceId: string, cents: number, paidAt: Date, sub = `sub_${workspaceId}`) {
  await h.billing.syncSubscription({
    id: sub,
    customer: `cus_${workspaceId}`,
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspaceId },
    items: { data: [{ id: `si_${sub}`, price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
  } as never);
  await h.billing.handleWebhook(
    JSON.stringify({
      id: `evt_${invoiceId}`,
      type: "invoice.paid",
      data: {
        object: {
          id: invoiceId,
          customer: `cus_${workspaceId}`,
          amount_paid: cents,
          currency: "usd",
          created: Math.floor(paidAt.getTime() / 1000),
          status_transitions: { paid_at: Math.floor(paidAt.getTime() / 1000) },
        },
      },
    }),
    "valid",
  );
}

describe("partner codes", () => {
  it("makes a unique code from the name", async () => {
    expect(codeStem("Priya Bagde")).toBe("PRIYA");
    expect(codeStem("Al Li")).toBe("ALLI");
    expect(codeStem("Zoë")).toBe("ZOE");
    expect(codeStem("Jo")).toBe("JOCREATOR");

    expect((await create({ name: "Priya Bagde" })).code).toBe("PRIYA");
    expect((await create({ name: "Priya K" })).code).toBe("PRIYA2");
    // A promo code already called KUNAL is skipped too.
    await h.promotions.create({ code: "KUNAL", kind: "free_pro", audience: "general", freeMonths: 1 } as never, admin.id);
    expect(await h.partners.suggestCode("Kunal Khairnar")).toBe("KUNAL2");
    // A code chosen by hand must be free.
    expect(await statusOf(create({ name: "Someone", code: "priya" }))).toBe(409);
  });

  it("gives the link, the defaults, and an audience code with the same name", async () => {
    const p = await create({ name: "Priya Bagde", email: "Priya@Example.com", discount: { kind: "free_pro", freeMonths: 1 } });
    expect(p).toMatchObject({
      code: "PRIYA",
      link: expect.stringMatching(/\/\?ref=priya$/),
      email: "priya@example.com",
      commissionPercent: 30,
      commissionMonths: 12,
      promo: { redemptions: 0, enabled: true },
    });
    const [promo] = (await h.promotions.list()).filter((c) => c.code === "PRIYA");
    expect(promo).toMatchObject({ kind: "free_pro", freeMonths: 1, audience: "creator" });
    const [entry] = await h.adminAudit.list(1);
    expect(entry).toMatchObject({ action: "partner.create", targetLabel: "Priya Bagde (PRIYA)" });
  });
});

describe("who a person belongs to", () => {
  it("is set by the partner's link at sign-up, with or without a page", async () => {
    const priya = await create({ name: "Priya" });
    const a = await signUpWithRef(1, "priya");
    const b = await signUpWithRef(2, "priya:debouncing-and-throttling-s49bby");
    const c = await signUpWithRef(3, "pub-header");
    expect(await referralOf(a.id)).toMatchObject({ partnerId: priya.id, via: "link" });
    expect(await referralOf(b.id)).toMatchObject({ partnerId: priya.id, via: "link" });
    expect(await referralOf(c.id)).toBeNull();
  });

  it("is set by using their code, but never replaces an earlier partner", async () => {
    const priya = await create({ name: "Priya", discount: { kind: "free_pro", freeMonths: 1 } });
    const kunal = await create({ name: "Kunal", discount: { kind: "free_pro", freeMonths: 1 } });
    const fromCode = await signUpWithRef(1, null);
    await h.promotions.apply(fromCode.workspaceId, "priya", fromCode.id);
    expect(await referralOf(fromCode.id)).toMatchObject({ partnerId: priya.id, via: "code" });

    const fromKunal = await signUpWithRef(2, "kunal");
    await h.promotions.apply(fromKunal.workspaceId, "PRIYA", fromKunal.id);
    expect(await referralOf(fromKunal.id)).toMatchObject({ partnerId: kunal.id, via: "link" });
  });

  it("ignores a switched-off partner's link", async () => {
    const priya = await create({ name: "Priya" });
    await h.partners.update(priya.id, { enabled: false }, admin.id);
    const a = await signUpWithRef(1, "priya");
    expect(await referralOf(a.id)).toBeNull();
  });
});

describe("earnings", () => {
  it("earns the share of each paid invoice once, inside the window", async () => {
    const priya = await create({ name: "Priya", commissionPercent: 30, commissionMonths: 2 });
    const reader = await signUpWithRef(1, "priya");
    const stranger = await signUpWithRef(2, null);

    const jan = new Date("2026-01-10T00:00:00Z");
    await paidInvoice(reader.workspaceId, "in_1", 1000, jan);
    await paidInvoice(reader.workspaceId, "in_1", 1000, jan); // Stripe retry
    await paidInvoice(reader.workspaceId, "in_2", 1000, new Date("2026-02-10T00:00:00Z"));
    await paidInvoice(reader.workspaceId, "in_3", 1000, new Date("2026-03-10T00:00:00Z")); // past 2 months
    await paidInvoice(stranger.workspaceId, "in_s", 1000, jan); // nobody's

    const d = await h.partners.detail(priya.id);
    expect(d.commissions.map((c) => [c.amountPaidCents, c.commissionCents])).toEqual([
      [1000, 0],
      [1000, 300],
      [1000, 300],
    ]);
    expect(d.stats).toMatchObject({ signups: 1, paying: 1, revenueCents: 3000, earnedCents: 600, owedCents: 600 });
    expect(d.referrals).toEqual([expect.objectContaining({ via: "link", paidCents: 3000, madeItems: 0 })]);
  });

  it("counts people who made something, and marks payouts", async () => {
    const priya = await create({ name: "Priya" });
    const a = await signUpWithRef(1, "priya");
    await signUpWithRef(2, "priya");
    await h.pages.create(a.workspaceId, { title: "First note" }, a.id);
    await paidInvoice(a.workspaceId, "in_a", 10000, new Date());

    let d = await h.partners.detail(priya.id);
    expect(d.stats).toMatchObject({ signups: 2, activated: 1, earnedCents: 3000, owedCents: 3000 });

    d = await h.partners.markPaidOut(priya.id, admin.id);
    expect(d.stats).toMatchObject({ earnedCents: 3000, owedCents: 0 });
    expect(d.commissions[0]!.paidOutAt).not.toBeNull();
    const [entry] = await h.adminAudit.list(1);
    expect(entry).toMatchObject({ action: "partner.payout", details: { invoices: 1, totalCents: 3000 } });
  });

  it("stops new earnings once the partner is switched off", async () => {
    const priya = await create({ name: "Priya" });
    const a = await signUpWithRef(1, "priya");
    await h.partners.update(priya.id, { enabled: false }, admin.id);
    await paidInvoice(a.workspaceId, "in_off", 1000, new Date());
    const d = await h.partners.detail(priya.id);
    expect(d.commissions.map((c) => c.commissionCents)).toEqual([0]);
  });
});

describe("types and the creator's own page", () => {
  it("records what kind of partner someone is", async () => {
    expect((await create({ name: "Priya" })).kind).toBe("creator");
    const f = await create({ name: "Rahul", kind: "founder" });
    expect(f.kind).toBe("founder");
    expect((await h.partners.update(f.id, { kind: "influencer" }, admin.id)).kind).toBe("influencer");
    expect(PartnerCreateSchema.safeParse({ name: "X", kind: "celebrity" }).success).toBe(false);
  });

  it("shows a creator their own link and numbers, matched by email, counts only", async () => {
    const priya = await h.signIn("Priya@Example.com");
    await create({ name: "Priya Bagde", email: "priya@example.com", discount: { kind: "free_pro", freeMonths: 1 } });
    const a = await signUpWithRef(1, "priya");
    await signUpWithRef(2, "priya");
    await h.pages.create(a.workspaceId, { title: "Hello" }, a.id);
    await paidInvoice(a.workspaceId, "in_c", 10000, new Date());

    const d = await h.partners.creatorDashboard(priya.id);
    expect(d).toMatchObject({
      name: "Priya Bagde",
      code: "PRIYA",
      link: expect.stringMatching(/\?ref=priya$/),
      offer: "Pro free for 1 month",
      signups: 2,
      activated: 1,
      paying: 1,
      earnedCents: 3000,
      paidOutCents: 0,
      owedCents: 3000,
    });
    expect(d!.weekly).toHaveLength(12);
    expect(d!.weekly.at(-1)!.signups).toBe(2);
    // Never who the people are.
    expect(JSON.stringify(d)).not.toContain("reader1@example.com");
    expect(JSON.stringify(d)).not.toContain("usr_");

    // Staff's preview is exactly what she sees.
    expect(await h.partners.creatorView((await h.partners.list())[0]!.id)).toEqual(d);

    // Someone who isn't a creator has no page.
    expect(await h.partners.creatorDashboard(admin.id)).toBeNull();
  });
});
