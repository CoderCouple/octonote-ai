CREATE TABLE "student_email_suffixes" (
	"id" text PRIMARY KEY DEFAULT ('sfx_' || gen_random_uuid()::text) NOT NULL,
	"suffix" text NOT NULL,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_email_suffixes_suffix_unique" UNIQUE("suffix")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_pro_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD CONSTRAINT "student_email_suffixes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "student_email_suffixes" ("suffix", "label") VALUES ('edu', 'US universities') ON CONFLICT ("suffix") DO NOTHING;--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "student_email_suffixes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.student_email_suffixes FROM anon, authenticated;
  END IF;
END $$;
