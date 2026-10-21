CREATE TABLE "crm_contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"owner_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_contacts_status" CHECK ("crm_contacts"."status" in ('new', 'contacted', 'replied', 'using', 'paying', 'not_interested'))
);
--> statement-breakpoint
CREATE TABLE "crm_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"body" text DEFAULT '' NOT NULL,
	"actor_user_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_email_id" text,
	"reply_to_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_entries_provider_email_id_unique" UNIQUE("provider_email_id"),
	CONSTRAINT "crm_entries_kind" CHECK ("crm_entries"."kind" in ('note', 'linkedin', 'call', 'whatsapp', 'meeting', 'email_out', 'email_in'))
);
--> statement-breakpoint
CREATE TABLE "crm_followups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"due_on" date NOT NULL,
	"note" text NOT NULL,
	"assigned_to_user_id" text,
	"created_by_user_id" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_entries" ADD CONSTRAINT "crm_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_entries" ADD CONSTRAINT "crm_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_followups" ADD CONSTRAINT "crm_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_followups" ADD CONSTRAINT "crm_followups_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_followups" ADD CONSTRAINT "crm_followups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_entries_user_idx" ON "crm_entries" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_followups_user_idx" ON "crm_followups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_followups_open_idx" ON "crm_followups" USING btree ("due_on") WHERE "crm_followups"."done_at" is null;--> statement-breakpoint
-- Only the API touches app data (see 0003_lock_public_tables).
ALTER TABLE "crm_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_followups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.crm_contacts FROM anon, authenticated;
    REVOKE ALL ON TABLE public.crm_entries FROM anon, authenticated;
    REVOKE ALL ON TABLE public.crm_followups FROM anon, authenticated;
  END IF;
END $$;
