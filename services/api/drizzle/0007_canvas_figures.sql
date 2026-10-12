CREATE TABLE "canvas_figures" (
	"id" text PRIMARY KEY NOT NULL,
	"canvas_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"image_path" text,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_email_suffixes" ALTER COLUMN "id" SET DEFAULT ('sfx_' || gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "canvas_figures" ADD CONSTRAINT "canvas_figures_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_figures" ADD CONSTRAINT "canvas_figures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_figures" ADD CONSTRAINT "canvas_figures_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canvas_figures_canvas_id_idx" ON "canvas_figures" USING btree ("canvas_id");--> statement-breakpoint
CREATE INDEX "canvas_figures_workspace_id_idx" ON "canvas_figures" USING btree ("workspace_id");--> statement-breakpoint
-- Like every app table: no Supabase Data API access (see 0003_lock_public_tables).
ALTER TABLE "canvas_figures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.canvas_figures FROM anon, authenticated;
  END IF;
END $$;
