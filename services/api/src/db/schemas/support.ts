import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A user's permission for Octonote support to view their account (Settings →
 * Privacy). Revoked grants keep their row for the record.
 */
export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("sag")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userIdx: index("support_access_grants_user_idx").on(table.userId, table.createdAt),
  }),
);

/**
 * A staff member viewing a user's account, read-only, for a short time. The
 * bearer token (`ons_…`) is stored only as a SHA-256 hash. `via` says whether
 * the user had granted access or an admin overrode (reason required, audited).
 */
export const supportSessions = pgTable(
  "support_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("sup")),
    tokenHash: text("token_hash").notNull(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantId: text("grant_id").references(() => supportAccessGrants.id, { onDelete: "set null" }),
    via: text("via").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({
    hashIdx: uniqueIndex("support_sessions_token_hash_idx").on(table.tokenHash),
    targetIdx: index("support_sessions_target_idx").on(table.targetUserId, table.createdAt),
    via: check("support_sessions_via", sql`${table.via} in ('grant', 'override')`),
  }),
);

/** Every request a support session made (method + path), for the record. */
export const supportSessionRequests = pgTable(
  "support_session_requests",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => supportSessions.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("support_session_requests_session_idx").on(table.sessionId, table.createdAt),
  }),
);
