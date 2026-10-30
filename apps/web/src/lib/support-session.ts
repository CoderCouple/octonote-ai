/**
 * Support sessions in the browser: staff open a person's account read-only
 * from the admin portal, which hands an `ons_…` token to /support-enter. The
 * token lives in a short-lived cookie on the main site's own host (never the
 * admin subdomain), and while it's there the app talks to the API as that
 * person. Admin pages never use it.
 */
import { SUPPORT_COOKIE, SUPPORT_TOKEN_PREFIX } from "@octonote/shared";

export function readSupportToken(): string | null {
  if (typeof document === "undefined") return null;
  if (location.pathname === "/admin" || location.pathname.startsWith("/admin/")) return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${SUPPORT_COOKIE}=`))
    ?.slice(SUPPORT_COOKIE.length + 1);
  const token = raw ? decodeURIComponent(raw) : null;
  return token?.startsWith(SUPPORT_TOKEN_PREFIX) ? token : null;
}

export function setSupportToken(token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${SUPPORT_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

export function clearSupportToken() {
  document.cookie = `${SUPPORT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
