/**
 * Browser-side API client for interactive calls (autosave, share dialog,
 * thumbnail upload). Server components use `serverFetch` instead.
 */
import { createApiClient } from "@octonote/api-client";
import { env } from "@/env/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readSupportToken } from "@/lib/support-session";

export const clientApi = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  // Pages opened inside the mobile app's WebView count as mobile use.
  client: () => (navigator.userAgent.includes("OctonoteApp") ? "mobile" : "web"),
  getBearerToken: async () => {
    // Staff viewing someone's account (read-only) act as that person.
    const support = readSupportToken();
    if (support) return support;
    const {
      data: { session },
    } = await createSupabaseBrowserClient().auth.getSession();
    return session?.access_token ?? null;
  },
});
