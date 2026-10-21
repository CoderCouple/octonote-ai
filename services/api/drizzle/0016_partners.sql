CREATE TABLE "partner_commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"workspace_id" text,
	"user_id" text,
	"stripe_invoice_id" text NOT NULL,
	"amount_paid_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"commission_cents" integer NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"paid_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_commissions_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id"),
	CONSTRAINT "partner_commissions_amounts" CHECK ("partner_commissions"."amount_paid_cents" >= 0 and "partner_commissions"."commission_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "partner_referrals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_referrals_via" CHECK ("partner_referrals"."via" in ('link', 'code'))
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"commission_percent" integer DEFAULT 30 NOT NULL,
	"commission_months" integer DEFAULT 12,
	"promo_code_id" text,
	"note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code"),
	CONSTRAINT "partners_code_upper" CHECK ("partners"."code" = upper("partners"."code") and "partners"."code" ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
	CONSTRAINT "partners_commission_percent" CHECK ("partners"."commission_percent" between 0 and 100),
	CONSTRAINT "partners_commission_months" CHECK ("partners"."commission_months" is null or "partners"."commission_months" between 1 and 60),
	CONSTRAINT "partners_email_lower" CHECK ("partners"."email" is null or "partners"."email" = lower("partners"."email"))
);
--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_referrals" ADD CONSTRAINT "partner_referrals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_commissions_partner_idx" ON "partner_commissions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_commissions_workspace_idx" ON "partner_commissions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "partner_referrals_partner_idx" ON "partner_referrals" USING btree ("partner_id");--> statement-breakpoint
-- Only the API touches app data (see 0003_lock_public_tables).
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_referrals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_commissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.partners FROM anon, authenticated;
    REVOKE ALL ON TABLE public.partner_referrals FROM anon, authenticated;
    REVOKE ALL ON TABLE public.partner_commissions FROM anon, authenticated;
  END IF;
END $$;
