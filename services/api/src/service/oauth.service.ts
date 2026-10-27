/**
 * Octonote as an OAuth 2.1 authorization server for assistant apps reaching
 * the MCP server (Claude.ai connectors, ChatGPT apps, Gemini CLI). Follows
 * MCP auth spec 2026-07-28:
 *   - public clients only, authorization code + PKCE (S256) required;
 *   - clients by Client ID Metadata Document (an https client_id URL) or,
 *     for older clients, Dynamic Client Registration;
 *   - every token is bound to the /mcp resource (RFC 8707) and refused
 *     anywhere else; the REST API never accepts these tokens;
 *   - access tokens last an hour; refresh tokens rotate, and reusing a
 *     spent one revokes the whole grant.
 * The consent screen lives on the web app; it approves through this service
 * with the person's own web session.
 */
import { Injectable, Optional } from "@nestjs/common";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NotFound } from "../common/error/error-factory";
import { ProductAnalytics } from "../common/product-analytics.service";
import { OAuthRepository } from "../db/repository/oauth.repository";
import { UsersRepository } from "../db/repository/users.repository";
import { CimdError, fetchClientMetadata, isCimdClientId } from "./lib/cimd-fetch";
import { appUrl } from "./lib/resource-url";

export const OAUTH_SCOPE = "octonote";
export const ACCESS_PREFIX = "ona_";
export const REFRESH_PREFIX = "onr_";
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_S = 60 * 24 * 60 * 60;
const REQUEST_TTL_MS = 10 * 60 * 1000;
/** Re-fetch a CIMD document after a day. */
const CIMD_TTL_MS = 24 * 60 * 60 * 1000;

/** An RFC 6749 error, sent as {error, error_description}. */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export function oauthIssuer(base: string) {
  return base.replace(/\/$/, "");
}
export function mcpResource(base: string) {
  return `${oauthIssuer(base)}/mcp`;
}

/** https anywhere, or http only on loopback (apps that run on your computer). */
export function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

function isLoopback(uri: string) {
  return new URL(uri).protocol === "http:";
}

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly repo: OAuthRepository,
    private readonly users: UsersRepository,
    @Optional() private readonly analytics: ProductAnalytics | null = null,
  ) {}

  // --- Discovery -----------------------------------------------------------

  protectedResourceMetadata(base: string) {
    return {
      resource: mcpResource(base),
      authorization_servers: [oauthIssuer(base)],
      scopes_supported: [OAUTH_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Octonote",
      resource_documentation: "https://docs.octonote.ai",
    };
  }

  authorizationServerMetadata(base: string) {
    const iss = oauthIssuer(base);
    return {
      issuer: iss,
      authorization_endpoint: `${iss}/oauth/authorize`,
      token_endpoint: `${iss}/oauth/token`,
      registration_endpoint: `${iss}/oauth/register`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    };
  }

  // --- Clients -------------------------------------------------------------

  /** RFC 7591 Dynamic Client Registration (kept for clients without CIMD). */
  async register(body: Record<string, unknown>) {
    const redirectUris = body.redirect_uris;
    if (!Array.isArray(redirectUris) || !redirectUris.length || redirectUris.length > 10) {
      throw new OAuthError("invalid_redirect_uri", "redirect_uris must list 1–10 URIs.");
    }
    if (!redirectUris.every((u) => typeof u === "string" && isAllowedRedirect(u))) {
      throw new OAuthError("invalid_redirect_uri", "Redirect URIs must be https, or http on localhost.");
    }
    const method = body.token_endpoint_auth_method ?? "none";
    if (method !== "none") {
      throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method: none) are supported.");
    }
    const name = cleanName(body.client_name) ?? hostOf(redirectUris[0] as string);
    const client = await this.repo.insertClient({
      kind: "dcr",
      name,
      redirectUris: redirectUris as string[],
      clientUri: cleanUrl(body.client_uri),
      logoUri: cleanUrl(body.logo_uri),
    });
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }

  /** A registered client, or a CIMD client fetched (and cached) from its URL. */
  async resolveClient(clientId: string) {
    if (isCimdClientId(clientId)) {
      const cached = await this.repo.findClient(clientId);
      if (cached?.fetchedAt && Date.now() - cached.fetchedAt.getTime() < CIMD_TTL_MS) return cached;
      let doc: Record<string, unknown>;
      try {
        doc = await fetchClientMetadata(clientId);
      } catch (err) {
        if (cached) return cached; // keep working through a blip
        throw new OAuthError("invalid_client", `Couldn't load the client's metadata: ${(err as CimdError).message}`);
      }
      if (doc.client_id !== clientId) {
        throw new OAuthError("invalid_client", "The client metadata's client_id doesn't match its URL.");
      }
      const uris = doc.redirect_uris;
      if (!Array.isArray(uris) || !uris.length || !uris.every((u) => typeof u === "string" && isAllowedRedirect(u))) {
        throw new OAuthError("invalid_client", "The client metadata needs https (or localhost) redirect_uris.");
      }
      if ((doc.token_endpoint_auth_method ?? "none") !== "none") {
        throw new OAuthError("invalid_client", "Only public clients are supported.");
      }
      return this.repo.upsertClient({
        id: clientId,
        kind: "cimd",
        name: cleanName(doc.client_name) ?? new URL(clientId).hostname,
        redirectUris: uris as string[],
        clientUri: cleanUrl(doc.client_uri),
        logoUri: cleanUrl(doc.logo_uri),
        fetchedAt: new Date(),
      });
    }
    const client = await this.repo.findClient(clientId);
    if (!client || client.kind !== "dcr") throw new OAuthError("invalid_client", "Unknown client_id.");
    return client;
  }

  // --- Authorize -----------------------------------------------------------

  /**
   * Validates an /oauth/authorize request. Errors before the redirect URI is
   * trusted are shown, never redirected (RFC 6749 §4.1.2.1); after that they
   * go back to the client. Returns where to send the browser.
   */
  async authorize(base: string, p: AuthorizeParams): Promise<{ redirect: string } | { show: OAuthError }> {
    if (!p.client_id) return { show: new OAuthError("invalid_request", "Missing client_id.") };
    let client: Awaited<ReturnType<OAuthService["resolveClient"]>>;
    try {
      client = await this.resolveClient(p.client_id);
    } catch (err) {
      return { show: err as OAuthError };
    }
    const redirectUri = p.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      return { show: new OAuthError("invalid_request", "redirect_uri isn't registered for this client.") };
    }
    const back = (error: string, description: string) => ({
      redirect: withParams(redirectUri, {
        error,
        error_description: description,
        state: p.state,
        iss: oauthIssuer(base),
      }),
    });
    if (p.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
    if (!p.code_challenge || p.code_challenge_method !== "S256") {
      return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
    }
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) return back("invalid_request", "Malformed code_challenge.");
    const resource = p.resource ?? mcpResource(base);
    if (resource !== mcpResource(base)) return back("invalid_target", "Unknown resource.");
    const scope = OAUTH_SCOPE; // one scope: the same reach as the CLI

    const request = await this.repo.insertRequest({
      clientId: client.id,
      redirectUri,
      codeChallenge: p.code_challenge,
      state: p.state ?? null,
      scope,
      resource,
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    });
    return { redirect: `${appUrl()}/connect/authorize?request=${request.id}` };
  }

  /** What the consent screen shows. Never the code, never another user's request. */
  async describeRequest(requestId: string) {
    const req = await this.liveRequest(requestId);
    const client = await this.repo.findClient(req.clientId);
    return {
      id: req.id,
      clientName: client?.name ?? "An app",
      clientUri: client?.clientUri ?? null,
      logoUri: client?.logoUri ?? null,
      redirectHost: new URL(req.redirectUri).host,
      /** The app runs on the person's own computer (loopback redirect). */
      local: isLoopback(req.redirectUri),
      verified: client?.kind === "cimd",
      expiresAt: req.expiresAt.toISOString(),
    };
  }

  /** The person clicked Allow: issue a one-time code and say where to go. */
  async approve(base: string, requestId: string, userId: string) {
    const req = await this.liveRequest(requestId);
    const code = newSecret("onc_");
    await this.repo.updateRequest(req.id, { userId, codeHash: hashToken(code), approvedAt: new Date() });
    return { redirect: withParams(req.redirectUri, { code, state: req.state, iss: oauthIssuer(base) }) };
  }

  async deny(base: string, requestId: string) {
    const req = await this.liveRequest(requestId);
    await this.repo.updateRequest(req.id, { deniedAt: new Date() });
    return {
      redirect: withParams(req.redirectUri, {
        error: "access_denied",
        error_description: "The person declined.",
        state: req.state,
        iss: oauthIssuer(base),
      }),
    };
  }

  private async liveRequest(requestId: string) {
    const req = await this.repo.findRequest(requestId);
    if (!req || req.approvedAt || req.deniedAt || req.expiresAt.getTime() < Date.now()) {
      throw NotFound("This sign-in link has expired. Start again from the app.");
    }
    return req;
  }

  // --- Token ---------------------------------------------------------------

  async token(base: string, body: Record<string, unknown>): Promise<TokenResponse> {
    const grantType = str(body.grant_type);
    if (grantType === "authorization_code") return this.exchangeCode(base, body);
    if (grantType === "refresh_token") return this.refresh(base, body);
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  private async exchangeCode(base: string, body: Record<string, unknown>): Promise<TokenResponse> {
    const code = str(body.code);
    const verifier = str(body.code_verifier);
    if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required.");
    const req = await this.repo.findRequestByCode(hashToken(code));
    const bad = () => new OAuthError("invalid_grant", "The code is invalid, expired or already used.");
    if (!req || !req.approvedAt || !req.userId || req.expiresAt.getTime() < Date.now()) throw bad();
    if (str(body.client_id) && str(body.client_id) !== req.clientId) throw bad();
    if (str(body.redirect_uri) && str(body.redirect_uri) !== req.redirectUri) throw bad();
    if (str(body.resource) && str(body.resource) !== req.resource) {
      throw new OAuthError("invalid_target", "The resource doesn't match the authorization.");
    }
    if (!pkceMatches(verifier, req.codeChallenge)) throw bad();
    if (!(await this.repo.spendCode(req.id))) throw bad();

    const client = await this.repo.findClient(req.clientId);
    const grant = await this.repo.insertGrant({
      userId: req.userId,
      clientId: req.clientId,
      clientName: client?.name ?? "An app",
      scope: req.scope,
      resource: req.resource,
    });
    void this.analytics?.capture(req.userId, "assistant_app_connected", { client: grant.clientName });
    return this.issue(grant.id, grant.scope);
  }

  private async refresh(base: string, body: Record<string, unknown>): Promise<TokenResponse> {
    const token = str(body.refresh_token);
    if (!token?.startsWith(REFRESH_PREFIX)) throw new OAuthError("invalid_grant", "Invalid refresh token.");
    const row = await this.repo.findToken(hashToken(token));
    const bad = () => new OAuthError("invalid_grant", "The refresh token is invalid or expired.");
    if (!row || row.kind !== "refresh") throw bad();
    const grant = await this.repo.findGrant(row.grantId);
    if (!grant || grant.revokedAt) throw bad();
    if (str(body.client_id) && str(body.client_id) !== grant.clientId) throw bad();
    if (str(body.resource) && str(body.resource) !== grant.resource) {
      throw new OAuthError("invalid_target", "The resource doesn't match the grant.");
    }
    if (row.expiresAt.getTime() < Date.now()) throw bad();
    if (!(await this.repo.spendToken(row.id))) {
      // A spent refresh token came back: someone else has it. End the grant.
      await this.repo.revokeGrant(grant.id);
      throw bad();
    }
    return this.issue(grant.id, grant.scope);
  }

  private async issue(grantId: string, scope: string): Promise<TokenResponse> {
    const access = newSecret(ACCESS_PREFIX);
    const refresh = newSecret(REFRESH_PREFIX);
    const now = Date.now();
    await this.repo.insertToken({
      grantId,
      kind: "access",
      tokenHash: hashToken(access),
      expiresAt: new Date(now + ACCESS_TTL_S * 1000),
    });
    await this.repo.insertToken({
      grantId,
      kind: "refresh",
      tokenHash: hashToken(refresh),
      expiresAt: new Date(now + REFRESH_TTL_S * 1000),
    });
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
  }

  // --- Using a token -------------------------------------------------------

  /** The person behind an access token, if it's live and issued for `resource`. */
  async verifyAccessToken(token: string, resource: string) {
    if (!token.startsWith(ACCESS_PREFIX)) return null;
    const row = await this.repo.findToken(hashToken(token));
    if (!row || row.kind !== "access" || row.expiresAt.getTime() < Date.now()) return null;
    const grant = await this.repo.findGrant(row.grantId);
    if (!grant || grant.revokedAt || grant.resource !== resource) return null;
    const user = await this.users.findById(grant.userId);
    if (!user) return null;
    // At most one write a minute per grant.
    if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > 60_000) void this.repo.touchGrant(grant.id);
    return { user, grantId: grant.id, clientName: grant.clientName };
  }

  // --- Settings → Connected apps -------------------------------------------

  async listGrants(userId: string) {
    return (await this.repo.listGrants(userId)).map((g) => ({
      id: g.id,
      clientName: g.clientName,
      createdAt: g.createdAt.toISOString(),
      lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async revokeGrant(id: string, userId: string) {
    const grant = await this.repo.findGrant(id);
    if (!grant || grant.userId !== userId) throw NotFound("Connection not found.");
    if (!grant.revokedAt) await this.repo.revokeGrant(id);
    return { id, revoked: true };
  }
}

function pkceMatches(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

function withParams(uri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function cleanName(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null;
}

function cleanUrl(v: unknown) {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(uri: string) {
  try {
    return new URL(uri).hostname;
  } catch {
    return "An app";
  }
}
