CREATE TABLE "videos" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"concept" text NOT NULL,
	"orientation" text DEFAULT 'landscape' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"title" text,
	"chapters" jsonb,
	"video_path" text,
	"poster_path" text,
	"duration_seconds" real,
	"bytes" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "videos_created_by_idx" ON "videos" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
-- Only the API reads and writes this table (see 0003_lock_public_tables).
ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;
