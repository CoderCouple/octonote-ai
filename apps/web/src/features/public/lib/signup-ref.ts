/**
 * Where a sign-up came from. Links into /signup or /login carry
 * `?ref=<source>&from=<page slug>`; the middleware keeps them in a
 * first-party cookie, and the first /me call after sign-up sends it to the
 * API, which stores it on the new account (users.signup_ref) for the admin
 * dashboard. Nothing about the visitor is stored before they sign up.
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
