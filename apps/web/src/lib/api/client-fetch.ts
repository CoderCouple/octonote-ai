/**
 * Browser-side API client for interactive calls (autosave, share dialog,
 * thumbnail upload). Server components use `serverFetch` instead.
 */
import { createApiClient } from "@octonote/api-client";
import { env } from "@/env/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const clientApi = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getBearerToken: async () => {
    const {
      data: { session },
    } = await createSupabaseBrowserClient().auth.getSession();
    return session?.access_token ?? null;
  },
});
