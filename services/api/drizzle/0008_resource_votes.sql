CREATE TABLE "resource_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"resource_kind" "resource_kind" NOT NULL,
	"resource_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_votes" ADD CONSTRAINT "resource_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_votes_resource_user_idx" ON "resource_votes" USING btree ("resource_kind","resource_id","user_id");--> statement-breakpoint
CREATE INDEX "resource_votes_resource_idx" ON "resource_votes" USING btree ("resource_kind","resource_id");--> statement-breakpoint
ALTER TABLE "resource_votes" ADD CONSTRAINT "resource_votes_value_check" CHECK ("value" IN (1, -1));--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "resource_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.resource_votes FROM anon, authenticated;
  END IF;
END $$;
