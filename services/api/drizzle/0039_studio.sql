CREATE TABLE "studio_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"spec" jsonb,
	"error" text,
	"source_type" text NOT NULL,
	"source_label" text NOT NULL,
	"source_ref" text,
	"source_text" text NOT NULL,
	"duration_ms" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_items" ADD CONSTRAINT "studio_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_items" ADD CONSTRAINT "studio_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_items_user_idx" ON "studio_items" USING btree ("user_id","workspace_id","updated_at");--> statement-breakpoint
-- Only the API reads and writes this table (see 0003_lock_public_tables).
ALTER TABLE "studio_items" ENABLE ROW LEVEL SECURITY;
