import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `users.id` is set explicitly by the auth guard from the Supabase JWT subject
 * (no $defaultFn): `id = "usr_" + jwt.sub`. Keeps our user IDs in lockstep
 * with Supabase Auth while still being self-describing.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
