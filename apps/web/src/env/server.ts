/**
 * Server-only environment variables. Importing this from a Client Component
 * will throw at build time — the whole point of the split.
 *
 * Add server-only secrets HERE (Supabase service role key when we use it,
 * Resend API key on the web side if we ever proxy mail through Next, etc.).
 */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Add server-only secrets here as we add server actions that need them.
    // Example: SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  },
  // We can't destructure process.env in Edge runtimes, so map keys explicitly.
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
