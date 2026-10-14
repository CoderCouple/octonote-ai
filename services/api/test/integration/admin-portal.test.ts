/**
 * The admin portal's tools.
 *   - Finding people and workspaces.
 *   - Giving, extending and ending Pro by hand (it counts as Pro everywhere).
 *   - Cancelling a subscription now, with a refund.
 *   - Student email endings.
 *   - The audit log records every change; the sign-in handoff mints a token.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "../../src/db/schemas/users";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let admin: Awaited<ReturnType<Harness["signIn"]>>;
let alice: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  admin = await h.signIn("staff@octonote.ai");
  alice = await h.signIn("alice@example.com");
  await h.db.update(users).set({ isAdmin: true }).where(eq(users.id, admin.id));
});

const actions = async () => (await h.adminAudit.list()).map((e) => e.action);

describe("lookup", () => {
  it("finds people by email, name or id", async () => {
    expect((await h.admin.searchUsers("ALICE@")).map((u) => u.email)).toEqual(["alice@example.com"]);
    expect((await h.admin.searchUsers(alice.id)).map((u) => u.id)).toEqual([alice.id]);
    expect(await h.admin.searchUsers("100%_")).toEqual([]); // wildcards are literal
    expect((await h.admin.searchUsers("")).length).toBe(2);
  });

  it("shows a person's workspaces, plan and activity", async () => {
    await h.activity.record(alice.id, "web");
    await h.activity.record(alice.id, "cli");
    const u = await h.admin.user(alice.id);
    expect(u).toMatchObject({ email: "alice@example.com", pro: false, workspaces: 1, sources: ["web", "cli"], activeDays30: 1 });
    expect(u.memberships[0]).toMatchObject({ id: alice.workspaceId, role: "OWNER", plan: { plan: "free", source: null } });
    expect(await statusOf(h.admin.user("usr_nobody"))).toBe(404);
  });

  it("shows a workspace's members, usage and billing", async () => {
    await h.pages.create(alice.workspaceId, { title: "Hello" }, alice.id);
    const w = await h.admin.workspace(alice.workspaceId);
    expect(w.members).toEqual([expect.objectContaining({ email: "alice@example.com", role: "OWNER" })]);
    expect(w.usage.page).toBe(1);
    expect(w.billing).toMatchObject({ hasSubscription: false, stripeUrl: null });
  });
});

describe("grants", () => {
  it("give Pro, extend it from where it ends, and can be ended early", async () => {
    const before = Date.now();
    let w = await h.admin.grant(alice.workspaceId, { months: 2, reason: "Beta tester" }, admin.id);
    expect(w.plan).toMatchObject({ plan: "pro", source: "grant" });
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("pro");
    const firstEnd = new Date(w.plan.until!).getTime();
    expect(firstEnd).toBeGreaterThan(before + 55 * 86_400_000);

    w = await h.admin.grant(alice.workspaceId, { months: 1, reason: "Bug report" }, admin.id);
    const secondEnd = new Date(w.plan.until!).getTime();
    expect(secondEnd - firstEnd).toBeGreaterThan(27 * 86_400_000); // stacked, not overlapping
    expect(w.grants).toHaveLength(2);
    expect(w.grants[0]).toMatchObject({ reason: "Bug report", grantedBy: "staff@octonote.ai" });

    for (const g of w.grants) w = await h.admin.endGrant(g.id, admin.id);
    expect(w.plan.plan).toBe("free");
    expect(await statusOf(h.admin.endGrant(w.grants[0]!.id, admin.id))).toBe(409);
    expect(await actions()).toEqual(["grant.end", "grant.end", "grant.create", "grant.create"]);
  });

  it("show on the customer's Billing page", async () => {
    await h.admin.grant(alice.workspaceId, { months: 3, reason: "Partner" }, admin.id);
    expect(await h.billing.summary(alice.workspaceId, alice.id)).toMatchObject({ plan: "pro", source: "grant" });
  });
});

describe("cancel now", () => {
  it("ends the subscription immediately and refunds the last payment", async () => {
    const sub = {
      id: "sub_c",
      customer: "cus_c",
      status: "active",
      cancel_at_period_end: false,
      latest_invoice: "in_last",
      metadata: { workspaceId: alice.workspaceId },
      items: { data: [{ id: "si_c", price: { id: "price_month", recurring: { interval: "month" } }, current_period_end: 1_900_000_000 }] },
    };
    h.stripe.subscriptionsById.sub_c = sub;
    await h.billing.syncSubscription(sub as never);
    expect(await h.planLimits.planOf(alice.workspaceId)).toBe("pro");

    const w = await h.admin.cancelNow(alice.workspaceId, { refundLastPayment: true, reason: "Test purchase" }, admin.id);
    expect(h.stripe.cancelled).toEqual(["sub_c"]);
    expect(h.stripe.refunded).toEqual(["pi_for_in_last"]);
    expect(w.plan.plan).toBe("free");
    expect(w.history.map((e) => e.kind)).toEqual(["ended", "started"]);
    const [entry] = await h.adminAudit.list();
    expect(entry).toMatchObject({ action: "subscription.cancel", details: { reason: "Test purchase", refundedCents: 500 } });
  });

  it("refuses a workspace with no subscription", async () => {
    expect(await statusOf(h.admin.cancelNow(alice.workspaceId, { refundLastPayment: false, reason: "x y z" }, admin.id))).toBe(400);
  });
});

describe("student email endings", () => {
  it("can be added and switched off, and count current students", async () => {
    await h.db.update(users).set({ studentProUntil: new Date(Date.now() + 86_400_000) }).where(eq(users.id, alice.id));
    await h.db.update(users).set({ email: "alice@cs.ox.ac.uk" }).where(eq(users.id, alice.id));
    let list = await h.admin.addStudentDomain({ suffix: "ac.uk", label: "UK universities" }, admin.id);
    const uk = list.find((d) => d.suffix === "ac.uk")!;
    expect(uk).toMatchObject({ enabled: true, activeStudents: 1, label: "UK universities" });
    expect(await statusOf(h.admin.addStudentDomain({ suffix: "ac.uk" }, admin.id))).toBe(409);
    list = await h.admin.setStudentDomainEnabled(uk.id, false, admin.id);
    expect(list.find((d) => d.suffix === "ac.uk")!.enabled).toBe(false);
    expect(await actions()).toEqual(["student_domain.disable", "student_domain.add"]);
  });
});

describe("audit log and sign-in", () => {
  it("pages through entries, newest first", async () => {
    for (let i = 0; i < 3; i++) await h.adminAudit.record(admin.id, { action: `test.${i}` });
    const first = await h.adminAudit.list(2);
    expect(first.map((e) => e.action)).toEqual(["test.2", "test.1"]);
    expect(first[0]!.actorEmail).toBe("staff@octonote.ai");
    const next = await h.adminAudit.list(2, first[1]!.createdAt);
    expect(next.map((e) => e.action)).toEqual(["test.0"]);
  });

  it("hands the portal a one-time sign-in token for the admin's own email", async () => {
    expect(await h.admin.handoff(admin.id)).toEqual({ tokenHash: "hash_for_staff@octonote.ai" });
    expect(h.supabase.links).toEqual(["staff@octonote.ai"]);
  });
});
