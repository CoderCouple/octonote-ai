import { SITE_HOST } from "@/lib/site";

/**
 * Where the admin portal lives for a given main-site host: admin.octonote.ai
 * in production, admin.localhost:3000 locally. Other hosts (Vercel previews)
 * have no admin subdomain, so the portal stays on the same host there.
 */
export function adminHostFor(host: string): string {
  if (host.startsWith("admin.")) return host;
  if (host === SITE_HOST || host.startsWith("localhost")) return `admin.${host}`;
  return host;
}

/** The main site's host for a portal host (the reverse of adminHostFor). */
export function mainHostFor(host: string): string {
  return host.startsWith("admin.") ? host.slice("admin.".length) : host;
}

export const isAdminHost = (host: string) => host.startsWith("admin.");

/** Portal paths are /admin or below; anything else falls back to the overview. */
export function safeAdminPath(path: string | null | undefined): string {
  return path && /^\/admin(\/[\w\-/]*)?$/.test(path) ? path : "/admin";
}
