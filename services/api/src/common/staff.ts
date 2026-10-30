/**
 * Who counts as staff for analytics: admins (users.is_admin), anyone with
 * an @octonote.ai address, and the extra addresses in STAFF_EMAILS
 * (comma-separated; kept out of the repo). Staff are never sent to PostHog
 * and can be left out of the admin dashboard. This is only about counting:
 * admin access still needs users.is_admin.
 */
import { sql, type SQL } from "drizzle-orm";

export const STAFF_EMAIL_DOMAIN = "octonote.ai";

export function staffEmails(): string[] {
  return (process.env.STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isStaff(user: { email: string; isAdmin?: boolean | null }): boolean {
  const email = user.email.trim().toLowerCase();
  return Boolean(user.isAdmin) || email.endsWith(`@${STAFF_EMAIL_DOMAIN}`) || staffEmails().includes(email);
}

/** `(select id from users where <staff>)`, for `user_id not in …` filters. */
export function staffUserIds(): SQL {
  const extra = staffEmails();
  const listed = extra.length
    ? sql` or lower(email) in (${sql.join(
        extra.map((e) => sql`${e}`),
        sql`, `,
      )})`
    : sql``;
  return sql`(select id from users where is_admin or lower(email) like ${`%@${STAFF_EMAIL_DOMAIN}`}${listed})`;
}
