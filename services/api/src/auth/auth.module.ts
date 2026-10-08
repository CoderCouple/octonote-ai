import { Global, Module } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { OptionalSupabaseAuthGuard } from "./optional-supabase-auth.guard";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { SUPABASE_CLIENT } from "./supabase.tokens";

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          throw new Error(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Octonote API.",
          );
        }
        return createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      },
    },
    SupabaseAuthGuard,
    OptionalSupabaseAuthGuard,
  ],
  exports: [SUPABASE_CLIENT, SupabaseAuthGuard, OptionalSupabaseAuthGuard],
})
export class AuthModule {}
