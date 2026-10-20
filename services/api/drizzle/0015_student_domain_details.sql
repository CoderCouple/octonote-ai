ALTER TABLE "student_email_suffixes" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD COLUMN "university" text;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD COLUMN "website" text;--> statement-breakpoint
CREATE INDEX "student_email_suffixes_country_idx" ON "student_email_suffixes" USING btree ("country_code");--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD CONSTRAINT "student_email_suffixes_country_code_check" CHECK ("student_email_suffixes"."country_code" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ADD CONSTRAINT "student_email_suffixes_source_check" CHECK ("student_email_suffixes"."source" in ('hipo', 'manual'));