CREATE TABLE "cli_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD CONSTRAINT "cli_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cli_tokens_token_hash_idx" ON "cli_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "cli_tokens_user_id_idx" ON "cli_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "cli_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.cli_tokens FROM anon, authenticated;
  END IF;
END $$;
