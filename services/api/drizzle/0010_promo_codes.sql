CREATE TABLE "promo_codes" (
	"id" text PRIMARY KEY DEFAULT ('pmc_' || gen_random_uuid()::text) NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"audience" text DEFAULT 'general' NOT NULL,
	"percent_off" integer,
	"amount_off_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"duration" text,
	"duration_months" integer,
	"free_months" integer,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"assigned_email" text,
	"note" text,
	"stripe_coupon_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "promo_codes_code_upper" CHECK ("promo_codes"."code" = upper("promo_codes"."code") and "promo_codes"."code" ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
	CONSTRAINT "promo_codes_kind" CHECK ("promo_codes"."kind" in ('percent_off', 'amount_off', 'free_pro')),
	CONSTRAINT "promo_codes_audience" CHECK ("promo_codes"."audience" in ('founder', 'creator', 'student', 'partner', 'general')),
	CONSTRAINT "promo_codes_shape" CHECK ((
        ("promo_codes"."kind" = 'percent_off' and coalesce("promo_codes"."percent_off" between 1 and 100, false) and "promo_codes"."amount_off_cents" is null and "promo_codes"."free_months" is null and "promo_codes"."duration" is not null)
        or ("promo_codes"."kind" = 'amount_off' and coalesce("promo_codes"."amount_off_cents" > 0, false) and "promo_codes"."percent_off" is null and "promo_codes"."free_months" is null and "promo_codes"."duration" is not null)
        or ("promo_codes"."kind" = 'free_pro' and coalesce("promo_codes"."free_months" between 1 and 36, false) and "promo_codes"."percent_off" is null and "promo_codes"."amount_off_cents" is null and "promo_codes"."duration" is null)
      )),
	CONSTRAINT "promo_codes_duration" CHECK (("promo_codes"."duration" is null and "promo_codes"."duration_months" is null)
        or ("promo_codes"."duration" in ('once', 'forever') and "promo_codes"."duration_months" is null)
        or ("promo_codes"."duration" = 'repeating' and coalesce("promo_codes"."duration_months" between 1 and 36, false))),
	CONSTRAINT "promo_codes_uses" CHECK ("promo_codes"."redemption_count" >= 0 and ("promo_codes"."max_redemptions" is null or ("promo_codes"."max_redemptions" > 0 and "promo_codes"."redemption_count" <= "promo_codes"."max_redemptions"))),
	CONSTRAINT "promo_codes_email_lower" CHECK ("promo_codes"."assigned_email" is null or "promo_codes"."assigned_email" = lower("promo_codes"."assigned_email"))
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"promo_code_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"pro_until" timestamp with time zone,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemptions_kind" CHECK ("promo_redemptions"."kind" in ('percent_off', 'amount_off', 'free_pro')),
	CONSTRAINT "promo_redemptions_free_has_end" CHECK (("promo_redemptions"."kind" = 'free_pro') = ("promo_redemptions"."pro_until" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_redemptions_code_workspace_idx" ON "promo_redemptions" USING btree ("promo_code_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_redemptions_one_free_idx" ON "promo_redemptions" USING btree ("workspace_id") WHERE "promo_redemptions"."kind" = 'free_pro';--> statement-breakpoint
CREATE INDEX "promo_redemptions_workspace_idx" ON "promo_redemptions" USING btree ("workspace_id");--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.promo_codes FROM anon, authenticated;
    REVOKE ALL ON TABLE public.promo_redemptions FROM anon, authenticated;
  END IF;
END $$;
