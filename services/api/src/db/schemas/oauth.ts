import { generateId } from "@octonote/shared";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * OAuth for assistant apps (Claude.ai connectors, ChatGPT apps, Gemini CLI)
 * reaching the MCP server at /mcp. Octonote is its own authorization server
 * (MCP auth spec 2026-07-28): public clients only, PKCE S256, tokens bound
 * to the /mcp resource.
 *
 * Clients come two ways: registered through DCR (a row with an occ_ id), or
 * named by a Client ID Metadata Document URL (CIMD) — then the URL is the id
 * and the row is a cache of the fetched document.
 */
export const oauthClients = pgTable("oauth_clients", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId("occ")),
  /** "dcr" | "cimd" */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  clientUri: text("client_uri"),
  logoUri: text("logo_uri"),
  /** CIMD: when the document was last fetched (re-fetched when stale). */
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One authorize attempt: created by /oauth/authorize, shown on the consent
 * page, then approved (carrying the one-time code, stored hashed) or denied.
 * Expires after 10 minutes; a code is redeemable once.
 */
export const oauthRequests = pgTable(
  "oauth_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("oar")),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    state: text("state"),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: uniqueIndex("oauth_requests_code_hash_idx").on(table.codeHash),
  }),
);

/** An app a person allowed: what Settings → Connected apps lists and revokes. */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("ocg")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    /** Copied at approval so the list reads well even if the client changes. */
    clientName: text("client_name").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userIdx: index("oauth_grants_user_id_idx").on(table.userId, table.createdAt),
  }),
);

/**
 * Access (ona_…, 1 hour) and refresh (onr_…, 60 days, rotated on use)
 * tokens for a grant, stored as SHA-256 hashes. Reusing a spent refresh
 * token revokes the whole grant (it was likely stolen).
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("oat")),
    grantId: text("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    /** "access" | "refresh" */
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    hashIdx: uniqueIndex("oauth_tokens_token_hash_idx").on(table.tokenHash),
    grantIdx: index("oauth_tokens_grant_id_idx").on(table.grantId),
  }),
);
