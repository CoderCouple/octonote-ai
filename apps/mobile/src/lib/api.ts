import { createApiClient } from "@octonote/api-client";
import { env } from "./env";
import { supabase } from "./supabase";

export const api = createApiClient({
  baseUrl: env.API_URL,
  getBearerToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});
