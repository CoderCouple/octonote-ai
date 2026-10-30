/**
 * Server-side fetch helper for feature `api/` files.
 *
 * Every feature's low-level api module imports `serverFetch` and uses it
 * to hit the Octonote api. Delegates the transport + envelope + error
 * behaviour to `@octonote/api-client` and only owns the "how do we
 * resolve a bearer token in a Next.js server context" concern (Supabase
 * SSR session cookie).
 *
 * Browser-side data fetching is done through hooks → server actions →
 * this function. Client components don't call this directly.
 */
import "server-only";
import { createApiClient } from "@octonote/api-client";
import { headers } from "next/headers";
import { serverSupportToken } from "@/lib/support-session-server";
import { env } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  // Requests made for the mobile app's WebView count as mobile use.
  client: async () => {
    try {
      return (await headers()).get("user-agent")?.includes("OctonoteApp") ? "mobile" : "web";
    } catch {
      return "web"; // outside a request (e.g. build time)
    }
  },
  getBearerToken: async () => {
    // Staff viewing someone's account (read-only) act as that person.
    const support = await serverSupportToken();
    if (support) return support;
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  },
});

export async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return apiClient.request<T>(path, init);
}
