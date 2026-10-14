CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_kind" text,
	"target_id" text,
	"target_label" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"months" integer NOT NULL,
	"pro_until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"granted_by_user_id" text,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_grants_months" CHECK ("pro_grants"."months" between 1 and 36)
);
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_grants" ADD CONSTRAINT "pro_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_grants" ADD CONSTRAINT "pro_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created_at_idx" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pro_grants_workspace_idx" ON "pro_grants" USING btree ("workspace_id");--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "pro_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.pro_grants FROM anon, authenticated;
    REVOKE ALL ON TABLE public.admin_audit FROM anon, authenticated;
  END IF;
END $$;
