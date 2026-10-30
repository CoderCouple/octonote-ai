/**
 * Support access: staff can view an account only inside the person's grant
 * (or by an admin override with a written reason), only for a short time, only to read,
 * and every session is audited and can be cut off by the person.
 */
import { ForbiddenException } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminGuard } from "../../src/auth/admin.guard";
import type { AuthenticatedRequest } from "../../src/auth/supabase-auth.guard";
import { userForSupportToken } from "../../src/auth/support-session-user";
import { asViewer } from "../../src/common/interceptor/support-view.interceptor";
import { requireWebSession } from "../../src/common/require-web-session";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let staff: Awaited<ReturnType<Harness["signIn"]>>;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let moduleRef: ModuleRef;

const REASON = "Alice reports her canvas won't open";

beforeEach(async () => {
  h = await createHarness();
  staff = await h.signIn("staff@octonote.ai");
  alice = await h.signIn("alice@example.com");
  moduleRef = { get: () => h.support } as unknown as ModuleRef;
});

const asUser = (token: string, method = "GET", url = "/workspaces") =>
  userForSupportToken(moduleRef, token, { method, url });

describe("support access", () => {
  it("needs the person's grant, unless an admin overrides", async () => {
    expect(await statusOf(h.support.start(staff.id, { userId: alice.id, reason: REASON, override: false }))).toBe(403);

    await h.support.grant(alice.id, 1);
    const s = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: false });
    expect(s.token).toMatch(/^ons_/);
    expect(new Date(s.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 1000);

    const user = await asUser(s.token);
    expect(user?.id).toBe(alice.id);
    expect(user?.supportSessionId).toBe(s.id);
    expect(user?.supportAdminId).toBe(staff.id);
  });

  it("an override sends no email, but is audited and shows in the person's Settings", async () => {
    const s = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    expect(h.email.sent).toHaveLength(0);
    expect((await asUser(s.token))?.id).toBe(alice.id);

    const audit = await h.adminAudit.list();
    expect(audit[0]).toMatchObject({ action: "support.override", targetId: alice.id });
    expect((await h.support.status(alice.id)).sessions[0]).toMatchObject({ id: s.id, via: "override" });
  });

  it("is read-only: writes are refused, Exit is allowed, requests are recorded", async () => {
    const s = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      await expect(asUser(s.token, method, "/pages/pag_x")).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(await asUser(s.token, "GET", "/pages/pag_x")).not.toBeNull();
    expect(await asUser(s.token, "DELETE", "/support-session")).not.toBeNull();

    await new Promise((r) => setTimeout(r, 50)); // request log is fire-and-forget
    const status = await h.support.adminStatus(alice.id);
    expect(status.sessions[0]!.requests).toBe(2);
    expect(status.sessions[0]!.reason).toBe(REASON);
  });

  it("stops when the person withdraws the grant, when ended, and when expired", async () => {
    await h.support.grant(alice.id, 7);
    const a = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: false });
    await h.support.revoke(alice.id);
    expect(await asUser(a.token)).toBeNull();

    const b = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    await h.support.end(b.id, staff.id);
    expect(await asUser(b.token)).toBeNull();

    const c = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    await h.db.execute(`update support_sessions set expires_at = now() - interval '1 minute' where id = '${c.id}'` as never);
    expect(await asUser(c.token)).toBeNull();
    expect(await asUser(`${c.token}x`)).toBeNull();
  });

  it("stores only the token's hash", async () => {
    const s = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    const rows = await h.db.query.supportSessions.findMany();
    expect(JSON.stringify(rows)).not.toContain(s.token);
  });

  it("can't reach the admin portal, mint tokens or change settings", async () => {
    await h.db.execute(`update users set is_admin = true where id = '${alice.id}'` as never);
    const s = await h.support.start(staff.id, { userId: alice.id, reason: REASON, override: true });
    const user = (await asUser(s.token))!;
    const req = { user } as AuthenticatedRequest;
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as never;
    await expect(new AdminGuard(h.db).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(() => requireWebSession(req, "Creating a CLI token")).toThrow();
  });

  it("rejects your own account", async () => {
    expect(await statusOf(h.support.start(staff.id, { userId: staff.id, reason: REASON, override: true }))).toBe(400);
  });

  it("reports every resource as viewer-only", () => {
    const body = { id: "pag_1", myRole: "owner", children: [{ myRole: "editor", title: "x" }], role: "OWNER" };
    expect(asViewer(body)).toEqual({ id: "pag_1", myRole: "viewer", children: [{ myRole: "viewer", title: "x" }], role: "OWNER" });
  });
});
