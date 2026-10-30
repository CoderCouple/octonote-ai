CREATE TABLE "note_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"block_ids" jsonb NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"seen_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "note_comments_status" CHECK ("note_comments"."status" in ('pending', 'working', 'done', 'failed', 'declined', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_comments_page_idx" ON "note_comments" USING btree ("page_id","created_at");--> statement-breakpoint
ALTER TABLE "note_comments" ENABLE ROW LEVEL SECURITY;
