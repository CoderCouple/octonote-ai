/**
 * Connecting the Octonote Clipper browser extension: a one-time code minted
 * on the web for the extension's PKCE challenge, traded with the verifier for
 * a token that can only work with collections.
 */
import { randomBytes } from "node:crypto";
import type { ExecutionContext } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ExtensionConnectController } from "../../src/api/v1/controller/extension-connect.controller";
import { cliTokenScopeAllows } from "../../src/auth/cli-token-scope";
import { OptionalSupabaseAuthGuard } from "../../src/auth/optional-supabase-auth.guard";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../src/auth/supabase-auth.guard";
import { WorkspaceMembersRepository } from "../../src/db/repository/workspace-members.repository";
import { CliTokensService } from "../../src/service/cli-tokens.service";
import { CollectionsService } from "../../src/service/collections.service";
import { ComposeAiService } from "../../src/service/compose-ai.service";
import {
  challengeFor,
  CONNECT_EXPIRED_MESSAGE,
  ExtensionConnectService,
} from "../../src/service/extension-connect.service";
import { McpToolsService } from "../../src/service/mcp-tools.service";
import { createHarness, statusOf, type Harness } from "./harness";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;
let connect: ExtensionConnectService;
let controller: ExtensionConnectController;
let collections: CollectionsService;
let guard: SupabaseAuthGuard;
let optionalGuard: OptionalSupabaseAuthGuard;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  const members = new WorkspaceMembersRepository(h.db);
  connect = new ExtensionConnectService(h.db, members, h.cliTokens);
  controller = new ExtensionConnectController(connect);
  const tools = new McpToolsService(
    members,
    h.pages,
    h.canvases,
    h.projects,
    h.notebooks,
    h.noteMarkdown,
    h.canvasDiagrams,
    h.settings,
    h.shares,
    h.figures,
  );
  collections = new CollectionsService(h.db, tools, new ComposeAiService());
  // Only the CLI token service is registered: activity recording is a no-op.
  const moduleRef = {
    get: (cls: unknown) => {
      if (cls === CliTokensService) return h.cliTokens;
      throw new Error("not registered");
    },
  } as unknown as ModuleRef;
  guard = new SupabaseAuthGuard({} as never, moduleRef);
  optionalGuard = new OptionalSupabaseAuthGuard({} as never, moduleRef);
});

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: challengeFor(verifier) };
};

/** Runs a request through the real auth guard; returns req.user or the HTTP status it was refused with. */
async function asToken(token: string, method: string, url: string, g: SupabaseAuthGuard | OptionalSupabaseAuthGuard = guard) {
  const req = { headers: { authorization: `Bearer ${token}` }, method, url } as unknown as AuthenticatedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  const status = await statusOf(g.canActivate(ctx));
  return { status, user: req.user };
}

const webReq = (userId: string) => ({ user: { id: userId }, headers: {} }) as unknown as AuthenticatedRequest;
const fromIp = (ip: string) => ({ headers: {}, ip }) as never;

async function connectedToken() {
  const { verifier, challenge } = pkce();
  const { code } = await controller.createCode({ workspaceId: alice.workspaceId, challenge }, webReq(alice.id));
  return controller.exchange({ code, verifier }, fromIp("1.1.1.1"));
}

describe("connecting the extension", () => {
  it("mints a short-lived one-time code, stored only as a hash", async () => {
    const { challenge } = pkce();
    const before = Date.now();
    const { code, expiresAt } = await controller.createCode({ workspaceId: alice.workspaceId, challenge }, webReq(alice.id));
    expect(code).toMatch(/^onc_[A-Za-z0-9_-]{43}$/);
    const ttl = new Date(expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(100_000);
    expect(ttl).toBeLessThanOrEqual(121_000);
    const rows = await h.db.query.extensionConnectCodes.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toMatch(/^xcc_/);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("trades code + verifier for a clipper token that can list collections and add a clip", async () => {
    const result = await connectedToken();
    expect(result.token).toMatch(/^ont_/);
    expect(result.workspaceId).toBe(alice.workspaceId);
    expect(typeof result.workspaceName).toBe("string");
    expect(result.workspaceName.length).toBeGreaterThan(0);

    const [row] = await h.db.query.cliTokens.findMany();
    expect(row).toMatchObject({ userId: alice.id, name: "Browser extension", scope: "clipper" });
    expect(result.scope).toBe("clipper");
    const days = (row!.expiresAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThanOrEqual(365);

    const list = await asToken(result.token, "GET", `/collections?workspaceId=${alice.workspaceId}`);
    expect(list.status).toBe(200);
    expect(list.user).toMatchObject({ id: alice.id, cliTokenScope: "clipper" });
    expect(await collections.list(list.user.id, alice.workspaceId)).toEqual([]);

    expect((await asToken(result.token, "POST", "/collections")).status).toBe(200);
    const c = await collections.create(alice.id, { workspaceId: alice.workspaceId, name: "Reading" });
    const add = await asToken(result.token, "POST", `/collections/${c.id}/clips`);
    expect(add.status).toBe(200);
    await collections.addClip(add.user.id, c.id, { content: "A clipped passage.", source: { app: "web" } });
    const got = (await collections.get(alice.id, c.id)) as { clips: { content: string }[] };
    expect(got.clips.map((x) => x.content)).toEqual(["A clipped passage."]);
  });

  it("rejects a wrong verifier, and the code is used up", async () => {
    const { verifier, challenge } = pkce();
    const { code } = await controller.createCode({ workspaceId: alice.workspaceId, challenge }, webReq(alice.id));
    await expect(connect.exchange({ code, verifier: pkce().verifier })).rejects.toThrow(CONNECT_EXPIRED_MESSAGE);
    expect(await statusOf(connect.exchange({ code, verifier }))).toBe(400);
    expect(await h.db.query.cliTokens.findMany()).toEqual([]);
  });

  it("works only once, even when two exchanges race", async () => {
    const { verifier, challenge } = pkce();
    const { code } = await controller.createCode({ workspaceId: alice.workspaceId, challenge }, webReq(alice.id));
    const results = await Promise.allSettled([
      connect.exchange({ code, verifier }),
      connect.exchange({ code, verifier }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(connect.exchange({ code, verifier })).rejects.toThrow(CONNECT_EXPIRED_MESSAGE);
    expect(await h.db.query.cliTokens.findMany()).toHaveLength(1);
  });

  it("rejects an expired code", async () => {
    const { verifier, challenge } = pkce();
    const { code } = await controller.createCode({ workspaceId: alice.workspaceId, challenge }, webReq(alice.id));
    await h.db.execute(`update extension_connect_codes set expires_at = now() - interval '1 second'` as never);
    await expect(connect.exchange({ code, verifier })).rejects.toThrow(CONNECT_EXPIRED_MESSAGE);
  });

  it("answers an unknown code or a malformed body with the same 400", async () => {
    const { verifier } = pkce();
    expect(await statusOf(connect.exchange({ code: "onc_nope", verifier }))).toBe(400);
    for (const body of [{}, { code: "onc_x", verifier: "short" }, "nonsense"]) {
      let thrown: unknown;
      try {
        controller.exchange(body, fromIp(`2.2.2.${Math.random()}`));
      } catch (err) {
        thrown = err;
      }
      expect((thrown as { getStatus(): number }).getStatus()).toBe(400);
      expect((thrown as Error).message).toBe(CONNECT_EXPIRED_MESSAGE);
    }
  });

  it("limits exchanges per address", async () => {
    const { verifier } = pkce();
    const tries = Array.from({ length: 11 }, () =>
      statusOf(Promise.resolve().then(() => controller.exchange({ code: "onc_x", verifier }, fromIp("3.3.3.3")))),
    );
    const statuses = await Promise.all(tries);
    expect(statuses.filter((s) => s === 400)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
    expect(await statusOf(Promise.resolve().then(() => controller.exchange({ code: "onc_x", verifier }, fromIp("4.4.4.4"))))).toBe(400);
  });

  it("only mints codes for the person's own workspace", async () => {
    const { challenge } = pkce();
    expect(
      await statusOf(controller.createCode({ workspaceId: bob.workspaceId, challenge }, webReq(alice.id))),
    ).toBe(404);
  });

  it("can't be started with a CLI token", async () => {
    const { challenge } = pkce();
    const viaToken = { user: { id: alice.id, cliTokenId: "tok_x" }, headers: {} } as unknown as AuthenticatedRequest;
    expect(await statusOf(Promise.resolve().then(() => controller.createCode({ workspaceId: alice.workspaceId, challenge }, viaToken)))).toBe(403);

    // A full CLI token gets through the guard but is refused by the handler; a clipper token by the guard.
    const { plaintext } = await h.cliTokens.create(alice.id, { name: "Laptop" });
    expect((await asToken(plaintext, "POST", "/extension/connect-codes")).status).toBe(200);
    const { token } = await connectedToken();
    expect((await asToken(token, "POST", "/extension/connect-codes")).status).toBe(403);
  });
});

describe("a clipper token", () => {
  it("is refused everywhere but collections and clips", async () => {
    const { token } = await connectedToken();
    const refused = [
      ["POST", "/collections/clc_1/compose"],
      ["POST", "/collections/clc_1/save"],
      ["DELETE", "/collections/clc_1"],
      ["GET", "/pages/pag_1"],
      ["PATCH", "/pages/pag_1"],
      ["GET", "/notebooks"],
      ["POST", "/me/cli-tokens"],
      ["GET", "/me/cli-tokens"],
      ["GET", "/me"],
    ] as const;
    for (const [method, url] of refused) {
      expect([method, url, (await asToken(token, method, url)).status]).toEqual([method, url, 403]);
    }
    // Routes with optional sign-in refuse it too, rather than treating it as anonymous.
    expect((await asToken(token, "GET", "/pages/pag_1", optionalGuard)).status).toBe(403);
    expect((await asToken(token, "GET", "/collections", optionalGuard)).status).toBe(200);

    let message = "";
    try {
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` }, method: "GET", url: "/pages/pag_1" }) }),
      } as unknown as ExecutionContext);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe("This token can only add clips to collections.");
  });

  it("can revoke itself", async () => {
    const { token } = await connectedToken();
    const { status, user } = await asToken(token, "DELETE", "/me/cli-tokens/current");
    expect(status).toBe(200);
    await h.cliTokens.revoke(user.cliTokenId!, user.id);
    expect((await asToken(token, "GET", "/collections")).status).toBe(401);
  });

  it("leaves full tokens and web sessions as they were", async () => {
    const { plaintext } = await h.cliTokens.create(alice.id, { name: "Laptop" });
    const full = await asToken(plaintext, "POST", "/collections/clc_1/compose");
    expect(full.status).toBe(200);
    expect(full.user.cliTokenScope).toBe("full");
    expect((await asToken(plaintext, "GET", "/pages/pag_1")).status).toBe(200);
  });
});

describe("the clipper route allowlist", () => {
  const allowed: [string, string][] = [
    ["GET", "/collections"],
    ["GET", "/collections?workspaceId=wsp_1"],
    ["GET", "/collections/"],
    ["POST", "/collections"],
    ["GET", "/collections/clc_1"],
    ["PATCH", "/collections/clc_1"],
    ["POST", "/collections/clc_1/clips"],
    ["POST", "/collections/clc_1/order"],
    ["PATCH", "/collections/clips/clp_1"],
    ["DELETE", "/collections/clips/clp_1"],
    ["delete", "/me/cli-tokens/current"],
  ];
  const refused: [string, string][] = [
    ["DELETE", "/collections/clc_1"],
    ["POST", "/collections/clc_1/compose"],
    ["POST", "/collections/clc_1/save"],
    ["PUT", "/collections/clc_1"],
    ["GET", "/collections/clc_1/clips/extra"],
    ["GET", "/collectionsX"],
    ["GET", "/x/collections"],
    ["POST", "/me/cli-tokens"],
    ["DELETE", "/me/cli-tokens/tok_1"],
    ["POST", "/extension/connect-codes"],
    ["GET", "/extension/items"],
    ["GET", "/extension/items/pag_1"],
    ["GET", "/extension/items/cnv_1/image"],
    ["GET", "/pages"],
    ["GET", ""],
  ];

  it("allows exactly the collection and clip routes", () => {
    for (const [m, u] of allowed) expect([m, u, cliTokenScopeAllows("clipper", m, u)]).toEqual([m, u, true]);
    for (const [m, u] of refused) expect([m, u, cliTokenScopeAllows("clipper", m, u)]).toEqual([m, u, false]);
  });

  it("lets a full token do anything, and an unknown scope nothing", () => {
    for (const [m, u] of [...allowed, ...refused]) expect(cliTokenScopeAllows("full", m, u)).toBe(true);
    expect(cliTokenScopeAllows("other" as never, "GET", "/collections")).toBe(false);
  });
});
