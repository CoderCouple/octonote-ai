/**
 * OAuth for assistant apps (the MCP server's sign-in): discovery, client
 * registration (DCR + CIMD), authorize → consent → code → token with PKCE,
 * resource binding, refresh rotation with reuse detection, and revoking a
 * connection. A bug here hands someone's notes to the wrong app.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPrivateAddress } from "../../src/service/lib/cimd-fetch";
import { mcpResource, OAuthError } from "../../src/service/oauth.service";
import { createHarness, statusOf, type Harness } from "./harness";

const fetchDoc = vi.hoisted(() => vi.fn());
vi.mock("../../src/service/lib/cimd-fetch", async (orig) => ({
  ...(await orig<typeof import("../../src/service/lib/cimd-fetch")>()),
  fetchClientMetadata: fetchDoc,
}));

const BASE = "https://api.octonote.test";
const RESOURCE = mcpResource(BASE);
const REDIRECT = "https://claude.example/api/mcp/auth_callback";

let h: Harness;
let alice: Awaited<ReturnType<Harness["signIn"]>>;
let bob: Awaited<ReturnType<Harness["signIn"]>>;

beforeEach(async () => {
  h = await createHarness();
  alice = await h.signIn("alice@example.com");
  bob = await h.signIn("bob@example.com");
  fetchDoc.mockReset();
});

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(redirect = REDIRECT) {
  return h.oauth.register({ client_name: "Claude", redirect_uris: [redirect] });
}

/** authorize → (consent) approve → returns the code and the request. */
async function authorizeAndApprove(clientId: string, userId = alice.id, extra: Record<string, string> = {}) {
  const { verifier, challenge } = pkce();
  const result = await h.oauth.authorize(BASE, {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: RESOURCE,
    ...extra,
  });
  if (!("redirect" in result)) throw result.show;
  const requestId = new URL(result.redirect).searchParams.get("request")!;
  const approved = await h.oauth.approve(BASE, requestId, userId);
  const url = new URL(approved.redirect);
  return { code: url.searchParams.get("code")!, verifier, url, requestId };
}

async function connect(userId = alice.id) {
  const client = await registerClient();
  const { code, verifier } = await authorizeAndApprove(client.client_id, userId);
  const tokens = await h.oauth.token(BASE, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    resource: RESOURCE,
  });
  return { client, tokens };
}

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (err) {
    return err instanceof OAuthError ? err.error : String(err);
  }
};

describe("oauth discovery", () => {
  it("points the /mcp resource at Octonote's authorization server", () => {
    expect(h.oauth.protectedResourceMetadata(BASE)).toMatchObject({
      resource: `${BASE}/mcp`,
      authorization_servers: [BASE],
    });
    expect(h.oauth.authorizationServerMetadata(BASE)).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/oauth/token`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
  });
});

describe("client registration", () => {
  it("registers public clients with https or loopback redirects only", async () => {
    const ok = await registerClient();
    expect(ok.client_id).toMatch(/^occ_/);
    expect(ok.token_endpoint_auth_method).toBe("none");
    expect((await registerClient("http://127.0.0.1:33418/callback")).client_id).toMatch(/^occ_/);
    expect(await errorOf(registerClient("http://evil.example/cb"))).toBe("invalid_redirect_uri");
    expect(await errorOf(registerClient("javascript:alert(1)"))).toBe("invalid_redirect_uri");
    expect(
      await errorOf(h.oauth.register({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" })),
    ).toBe("invalid_client_metadata");
  });

  it("loads a CIMD client from its URL and checks the document", async () => {
    const id = "https://claude.example/oauth/client.json";
    fetchDoc.mockResolvedValue({ client_id: id, client_name: "Claude", redirect_uris: [REDIRECT] });
    const client = await h.oauth.resolveClient(id);
    expect(client).toMatchObject({ id, kind: "cimd", name: "Claude" });
    await h.oauth.resolveClient(id); // cached
    expect(fetchDoc).toHaveBeenCalledTimes(1);

    const other = "https://evil.example/client.json";
    fetchDoc.mockResolvedValue({ client_id: "https://claude.example/oauth/client.json", redirect_uris: [REDIRECT] });
    expect(await errorOf(h.oauth.resolveClient(other))).toBe("invalid_client");
    fetchDoc.mockResolvedValue({ client_id: other, redirect_uris: ["http://evil.example/cb"] });
    expect(await errorOf(h.oauth.resolveClient(other))).toBe("invalid_client");
  });

  it("accepts a CIMD client that prefers private_key_jwt but supports none (ChatGPT)", async () => {
    const id = "https://chatgpt.example/oauth/client.json";
    fetchDoc.mockResolvedValue({
      client_id: id,
      client_name: "ChatGPT",
      redirect_uris: ["https://chatgpt.example/connector_platform_oauth_redirect"],
      token_endpoint_auth_method: "private_key_jwt",
      token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    });
    expect((await h.oauth.resolveClient(id)).name).toBe("ChatGPT");

    const strict = "https://strict.example/client.json";
    fetchDoc.mockResolvedValue({ client_id: strict, redirect_uris: [REDIRECT], token_endpoint_auth_method: "private_key_jwt" });
    expect(await errorOf(h.oauth.resolveClient(strict))).toBe("invalid_client");
  });

  it("never fetches private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("authorize", () => {
  it("shows errors (never redirects) until the client and redirect are trusted", async () => {
    expect(await h.oauth.authorize(BASE, { client_id: "occ_nope" })).toHaveProperty("show");
    const client = await registerClient();
    const wrong = await h.oauth.authorize(BASE, { client_id: client.client_id, redirect_uri: "https://evil.example/cb" });
    expect(wrong).toHaveProperty("show");
  });

  it("sends protocol errors back to the client, with state and iss", async () => {
    const client = await registerClient();
    const noPkce = await h.oauth.authorize(BASE, { response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, state: "s1" });
    const url = new URL((noPkce as { redirect: string }).redirect);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("error")).toBe("invalid_request");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("iss")).toBe(BASE);

    const { challenge } = pkce();
    const wrongResource = await h.oauth.authorize(BASE, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://other.example/mcp",
    });
    expect(new URL((wrongResource as { redirect: string }).redirect).searchParams.get("error")).toBe("invalid_target");
  });

  it("sends the person to the consent page, which describes the app", async () => {
    const client = await registerClient();
    const { challenge } = pkce();
    const result = await h.oauth.authorize(BASE, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const url = new URL((result as { redirect: string }).redirect);
    expect(url.pathname).toBe("/connect/authorize");
    const info = await h.oauth.describeRequest(url.searchParams.get("request")!);
    expect(info).toMatchObject({ clientName: "Claude", redirectHost: "claude.example", local: false });
    expect(JSON.stringify(info)).not.toMatch(/code_challenge|onc_/);
  });

  it("returns access_denied when the person declines, and the link can't be reused", async () => {
    const client = await registerClient();
    const { challenge } = pkce();
    const result = await h.oauth.authorize(BASE, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "s2",
    });
    const requestId = new URL((result as { redirect: string }).redirect).searchParams.get("request")!;
    const denied = new URL((await h.oauth.deny(BASE, requestId)).redirect);
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("s2");
    expect(await statusOf(h.oauth.approve(BASE, requestId, alice.id))).toBe(404);
  });
});

describe("tokens", () => {
  it("exchanges a code once, only with the right PKCE verifier", async () => {
    const client = await registerClient();
    const { code, verifier, url } = await authorizeAndApprove(client.client_id);
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe(BASE);

    const exchange = (v: string) =>
      h.oauth.token(BASE, { grant_type: "authorization_code", code, code_verifier: v, client_id: client.client_id, redirect_uri: REDIRECT });
    expect(await errorOf(exchange(pkce().verifier))).toBe("invalid_grant");
    const tokens = await exchange(verifier);
    expect(tokens.access_token).toMatch(/^ona_/);
    expect(tokens.refresh_token).toMatch(/^onr_/);
    expect(tokens.expires_in).toBe(3600);
    expect(await errorOf(exchange(verifier))).toBe("invalid_grant"); // replay

    const rows = await h.db.query.oauthTokens.findMany();
    expect(JSON.stringify(rows)).not.toContain(tokens.access_token);
  });

  it("rejects a code for another client or redirect", async () => {
    const client = await registerClient();
    const other = await registerClient();
    const { code, verifier } = await authorizeAndApprove(client.client_id);
    expect(
      await errorOf(h.oauth.token(BASE, { grant_type: "authorization_code", code, code_verifier: verifier, client_id: other.client_id })),
    ).toBe("invalid_grant");
  });

  it("accepts the access token only for the /mcp resource it was issued for", async () => {
    const { tokens } = await connect();
    const found = await h.oauth.verifyAccessToken(tokens.access_token, RESOURCE);
    expect(found?.user.id).toBe(alice.id);
    expect(await h.oauth.verifyAccessToken(tokens.access_token, "https://other.example/mcp")).toBeNull();
    expect(await h.oauth.verifyAccessToken(tokens.refresh_token, RESOURCE)).toBeNull();
    expect(await h.oauth.verifyAccessToken(`${tokens.access_token}x`, RESOURCE)).toBeNull();
  });

  it("stops accepting an expired access token", async () => {
    const { tokens } = await connect();
    await h.db.execute(`update oauth_tokens set expires_at = now() - interval '1 minute' where kind = 'access'` as never);
    expect(await h.oauth.verifyAccessToken(tokens.access_token, RESOURCE)).toBeNull();
  });

  it("rotates refresh tokens, and a reused one ends the connection", async () => {
    const { client, tokens } = await connect();
    const next = await h.oauth.token(BASE, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id });
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
    expect(await h.oauth.verifyAccessToken(next.access_token, RESOURCE)).not.toBeNull();

    // The old refresh token comes back: treat it as stolen.
    expect(await errorOf(h.oauth.token(BASE, { grant_type: "refresh_token", refresh_token: tokens.refresh_token }))).toBe("invalid_grant");
    expect(await h.oauth.verifyAccessToken(next.access_token, RESOURCE)).toBeNull();
    expect(await errorOf(h.oauth.token(BASE, { grant_type: "refresh_token", refresh_token: next.refresh_token }))).toBe("invalid_grant");
  });
});

describe("connected apps", () => {
  it("lists a person's connections; only they can revoke one, which ends its tokens", async () => {
    const { tokens } = await connect();
    const [grant] = await h.oauth.listGrants(alice.id);
    expect(grant).toMatchObject({ clientName: "Claude" });
    expect(await h.oauth.listGrants(bob.id)).toEqual([]);
    expect(await statusOf(h.oauth.revokeGrant(grant!.id, bob.id))).toBe(404);

    await h.oauth.revokeGrant(grant!.id, alice.id);
    expect(await h.oauth.verifyAccessToken(tokens.access_token, RESOURCE)).toBeNull();
    expect(await h.oauth.listGrants(alice.id)).toEqual([]);
  });

  it("expires an unanswered consent request", async () => {
    const client = await registerClient();
    const { challenge } = pkce();
    const result = await h.oauth.authorize(BASE, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const requestId = new URL((result as { redirect: string }).redirect).searchParams.get("request")!;
    await h.db.execute(`update oauth_requests set expires_at = now() - interval '1 minute'` as never);
    expect(await statusOf(h.oauth.describeRequest(requestId))).toBe(404);
  });
});
