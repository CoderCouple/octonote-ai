/**
 * Where a sign-up came from. Any page can carry `?ref=<source>` (a
 * creator's link: octonote.ai/?ref=priya), and links into /signup or /login
 * from published pages carry `?ref=pub&from=<page slug>`. The middleware keeps
 * it in a first-party cookie, and the first /me call after sign-up sends it to
 * the API, which stores it on the new account (users.signup_ref) and credits
 * the creator. Nothing about the visitor is stored before they sign up.
 */
export const SIGNUP_REF_COOKIE = "octo_ref";
export const SIGNUP_REF_HEADER = "x-octonote-ref";
export const SIGNUP_REF_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** The sign-up link for a reader of a published page. */
export function signupHref(slug?: string, ref = "pub"): string {
  const q = new URLSearchParams({ ref });
  if (slug) q.set("from", slug);
  return `/signup?${q.toString()}`;
}

/** `pub:my-page-x7q2`, limited to safe characters, or null. */
export function cleanSignupRef(
  ref: string | null | undefined,
  from?: string | null,
): string | null {
  const part = (s: string | null | undefined) =>
    (s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 80);
  const r = part(ref);
  if (!r) return null;
  const f = part(from);
  return f ? `${r}:${f}` : r;
}

/** Our own sources ("pub", "pub-header"); anything else is a creator's code. */
const isOwnSource = (ref: string) => ref === "pub" || ref.startsWith("pub:") || ref.startsWith("pub-");

/**
 * Whether a new ref may replace the one already remembered: only when none
 * is remembered or it's one of ours. A creator's ref is never replaced, so
 * the person who sent the visitor keeps the credit, not a button clicked later.
 */
export function shouldReplaceRef(existing: string | null | undefined): boolean {
  return !existing || isOwnSource(existing);
}
