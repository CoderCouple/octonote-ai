import { generateId } from "@octonote/shared";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CliTokenScope } from "./cli-tokens";
import { users } from "./users";

/**
 * One-time codes that connect the browser extension (Octonote Clipper). The
 * web app mints one for a signed-in person with the extension's PKCE
 * challenge; the extension trades it, with the verifier, for a clipper-scoped
 * token. Codes live two minutes, work once and are stored only as a hash.
 */
export const extensionConnectCodes = pgTable(
  "extension_connect_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("xcc")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    codeHash: text("code_hash").notNull(),
    /** base64url(sha256(verifier)), as the extension sent it. */
    challenge: text("challenge").notNull(),
    /** The token scope asked for: "clipper", or "clipper_read" when the person allowed reading. */
    scope: text("scope").$type<Extract<CliTokenScope, "clipper" | "clipper_read">>().notNull().default("clipper"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("extension_connect_codes_code_hash_idx").on(t.codeHash),
    index("extension_connect_codes_user_idx").on(t.userId, t.createdAt),
  ],
);

export type ExtensionConnectCode = typeof extensionConnectCodes.$inferSelect;
