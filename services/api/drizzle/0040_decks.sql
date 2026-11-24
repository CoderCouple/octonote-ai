ALTER TYPE "public"."resource_kind" ADD VALUE 'deck';--> statement-breakpoint
CREATE TABLE "decks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"notebook_id" text,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"source" jsonb,
	"link_access" "link_access" DEFAULT 'restricted' NOT NULL,
	"link_role" "share_role" DEFAULT 'viewer' NOT NULL,
	"public_slug" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "decks_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_workspace_id_idx" ON "decks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "decks_notebook_id_idx" ON "decks" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "decks_created_by_user_id_idx" ON "decks" USING btree ("created_by_user_id");--> statement-breakpoint
-- Only the API reads and writes this table (see 0003_lock_public_tables).
ALTER TABLE "decks" ENABLE ROW LEVEL SECURITY;
