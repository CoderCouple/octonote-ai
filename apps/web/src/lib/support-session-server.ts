import "server-only";
import { SUPPORT_COOKIE, SUPPORT_TOKEN_PREFIX } from "@octonote/shared";
import { cookies, headers } from "next/headers";
import { isAdminHost } from "@/features/admin/portal-url";

/** The running support session's token (see lib/support-session.ts), never on the admin portal. */
export async function serverSupportToken(): Promise<string | null> {
  try {
    if (isAdminHost((await headers()).get("host") ?? "")) return null;
    const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
    return token?.startsWith(SUPPORT_TOKEN_PREFIX) ? token : null;
  } catch {
    return null; // outside a request (e.g. build time)
  }
}
