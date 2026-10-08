/**
 * @deprecated — re-exports from `@/env/client`. Existing call sites use
 * the legacy short names (`env.SUPABASE_URL`); we keep them working
 * while features migrate one-by-one.
 *
 * New code should import directly from `@/env/client`.
 */
import { env as clientEnv } from "@/env/client";

export const env = {
  SUPABASE_URL: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  API_URL: clientEnv.NEXT_PUBLIC_API_URL,
};
