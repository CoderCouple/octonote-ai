CREATE TABLE "extension_connect_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "extension_connect_codes" ADD CONSTRAINT "extension_connect_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_connect_codes_code_hash_idx" ON "extension_connect_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "extension_connect_codes_user_idx" ON "extension_connect_codes" USING btree ("user_id","created_at");--> statement-breakpoint
-- Only the API reads and writes this table (see 0003_lock_public_tables).
ALTER TABLE "extension_connect_codes" ENABLE ROW LEVEL SECURITY;