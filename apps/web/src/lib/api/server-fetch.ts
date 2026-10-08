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
import { env } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getBearerToken: async () => {
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
