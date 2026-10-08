import { createBrowserClient } from "@supabase/ssr";
import { env } from "../env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
