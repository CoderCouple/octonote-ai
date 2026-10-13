/**
 * CLI / agent tokens: shown once, stored hashed, verified by the auth
 * guards, revocable, expiring — and unable to mint more tokens or delete
 * the account.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "../../src/auth/supabase-auth.guard";
import { requireWebSession } from "../../src/common/require-web-session";
import { hashCliToken } from "../../src/service/cli-tokens.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
});

describe("cli tokens", () => {
  it("returns the token once, stores only its hash, and verifies it", async () => {
    const { token, plaintext } = await h.cliTokens.create(alice.id, { name: "Laptop" });
    expect(plaintext).toMatch(/^ont_[A-Za-z0-9_-]{43}$/);
    expect(token.preview).toBe(`ont_…${plaintext.slice(-4)}`);
    expect(JSON.stringify(token)).not.toContain(plaintext);

    const rows = await h.db.query.cliTokens.findMany();
    expect(rows[0]!.tokenHash).toBe(hashCliToken(plaintext));
    expect(JSON.stringify(rows)).not.toContain(plaintext);

    const found = await h.cliTokens.verify(plaintext);
    expect(found?.user.id).toBe(alice.id);
    expect(await h.cliTokens.verify(`${plaintext}x`)).toBeNull();
  });

  it("stops working once revoked; others can't revoke or see it", async () => {
    const { token, plaintext } = await h.cliTokens.create(alice.id, { name: "CI" });
    expect(await statusOf(h.cliTokens.revoke(token.id, bob.id))).toBe(404);
    expect(await h.cliTokens.list(bob.id)).toEqual([]);
    expect(await h.cliTokens.verify(plaintext)).not.toBeNull();

    await h.cliTokens.revoke(token.id, alice.id);
    expect(await h.cliTokens.verify(plaintext)).toBeNull();
    expect(await h.cliTokens.list(alice.id)).toEqual([]);
  });

  it("stops working once expired", async () => {
    const { token, plaintext } = await h.cliTokens.create(alice.id, {
      name: "Short",
      expiresInDays: 1,
    });
    expect(await h.cliTokens.verify(plaintext)).not.toBeNull();
    await h.db.execute(
      `update cli_tokens set expires_at = now() - interval '1 minute' where id = '${token.id}'` as never,
    );
    expect(await h.cliTokens.verify(plaintext)).toBeNull();
  });

  it("goes away with the account", async () => {
    const { plaintext } = await h.cliTokens.create(alice.id, { name: "Laptop" });
    await h.account.deleteAccount(alice.id, alice.email, alice.email);
    expect(await h.cliTokens.verify(plaintext)).toBeNull();
  });

  it("can't mint more tokens or delete the account", () => {
    const viaToken = { user: { id: alice.id, cliTokenId: "tok_x" } } as AuthenticatedRequest;
    const viaWeb = { user: { id: alice.id } } as AuthenticatedRequest;
    expect(() => requireWebSession(viaToken, "Creating a CLI token")).toThrow(/signed in on the web/);
    expect(() => requireWebSession(viaWeb, "Creating a CLI token")).not.toThrow();
  });
});
