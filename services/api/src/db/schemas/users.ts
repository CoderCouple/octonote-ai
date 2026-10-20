import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  /** Free Pro for students (.edu etc.): set on first sign-in, never extended. */
  studentProUntil: timestamp("student_pro_until", { withTimezone: true }),
  /**
   * Where the account came from, e.g. "pub:my-page-x7q2" (the end of a
   * published page) or "pub-header". Set once, on the first sign-in.
   */
  signupRef: text("signup_ref"),
  /** Octonote staff: can open the admin pages (promo codes). Set by hand in SQL. */
  isAdmin: boolean("is_admin").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
