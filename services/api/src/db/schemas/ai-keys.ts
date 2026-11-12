import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A person's own AI provider key (bring your own key). Stored encrypted with
 * AI_KEYS_SECRET (AES-256-GCM); only the API can decrypt it, and it is never
 * sent back to a browser: the app shows the last four characters.
 */
export const userAiKeys = pgTable("user_ai_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("anthropic"),
  ciphertext: text("ciphertext").notNull(),
  last4: text("last4").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
