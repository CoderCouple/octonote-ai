CREATE TABLE "activity_days" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "activity_days_user_id_day_source_pk" PRIMARY KEY("user_id","day","source"),
	CONSTRAINT "activity_days_source" CHECK ("activity_days"."source" in ('web', 'mobile', 'cli'))
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"interval" text,
	"amount_cents" integer,
	"stripe_subscription_id" text,
	"stripe_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "billing_events_kind" CHECK ("billing_events"."kind" in ('started', 'cancel_scheduled', 'resumed', 'ended', 'interval_changed', 'past_due', 'payment_failed'))
);
--> statement-breakpoint
ALTER TABLE "activity_days" ADD CONSTRAINT "activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_days_day_idx" ON "activity_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "billing_events_created_at_idx" ON "billing_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billing_events_workspace_idx" ON "billing_events" USING btree ("workspace_id");--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "activity_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.activity_days FROM anon, authenticated;
    REVOKE ALL ON TABLE public.billing_events FROM anon, authenticated;
  END IF;
END $$;
