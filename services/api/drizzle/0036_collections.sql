CREATE TABLE "clips" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"content" text NOT NULL,
	"source" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clips_collection_idx" ON "clips" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "collections_user_idx" ON "collections" USING btree ("user_id","workspace_id","updated_at");--> statement-breakpoint
-- Only the API reads and writes these tables (see 0003_lock_public_tables).
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clips" ENABLE ROW LEVEL SECURITY;
