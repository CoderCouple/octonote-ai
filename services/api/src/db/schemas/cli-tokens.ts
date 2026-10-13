import { generateId } from "@octonote/shared";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Long-lived bearer tokens for the `octonote` CLI and the agents that drive
 * it (Claude, Codex, CI). The plaintext (`ont_<32 random bytes, base64url>`)
 * is shown once and stored only as a SHA-256 hash; the last 4 characters
 * stay readable so Settings can show "ont_…abcd". Revoked tokens keep their
 * row (revoked_at) for the record.
 */
export const cliTokens = pgTable(
  "cli_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("tok")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPreview: text("token_preview").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    hashIdx: uniqueIndex("cli_tokens_token_hash_idx").on(table.tokenHash),
    userIdx: index("cli_tokens_user_id_idx").on(table.userId, table.createdAt),
  }),
);
