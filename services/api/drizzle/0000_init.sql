CREATE TYPE "public"."link_access" AS ENUM('restricted', 'anyone_with_link');--> statement-breakpoint
CREATE TYPE "public"."resource_kind" AS ENUM('page', 'canvas', 'project', 'notebook');--> statement-breakpoint
CREATE TYPE "public"."share_role" AS ENUM('viewer', 'editor');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('active', 'pending', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notebooks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"link_access" "link_access" DEFAULT 'restricted' NOT NULL,
	"link_role" "share_role" DEFAULT 'viewer' NOT NULL,
	"public_slug" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notebooks_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"notebook_id" text,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link_access" "link_access" DEFAULT 'restricted' NOT NULL,
	"link_role" "share_role" DEFAULT 'viewer' NOT NULL,
	"public_slug" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"notebook_id" text,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link_access" "link_access" DEFAULT 'restricted' NOT NULL,
	"link_role" "share_role" DEFAULT 'viewer' NOT NULL,
	"public_slug" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pages_public_slug_unique" UNIQUE("public_slug"),
	CONSTRAINT "pages_project_xor_notebook" CHECK ("pages"."project_id" IS NULL OR "pages"."notebook_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"notebook_id" text,
	"created_by_user_id" text NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"thumbnail_url" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link_access" "link_access" DEFAULT 'restricted' NOT NULL,
	"link_role" "share_role" DEFAULT 'viewer' NOT NULL,
	"public_slug" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "canvases_public_slug_unique" UNIQUE("public_slug"),
	CONSTRAINT "canvases_project_xor_notebook" CHECK ("canvases"."project_id" IS NULL OR "canvases"."notebook_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "resource_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"resource_kind" "resource_kind" NOT NULL,
	"resource_id" text NOT NULL,
	"granted_to_user_id" text,
	"granted_to_email" text,
	"role" "share_role" DEFAULT 'viewer' NOT NULL,
	"status" "share_status" DEFAULT 'active' NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "resource_shares_subject_xor" CHECK (("resource_shares"."granted_to_user_id" IS NULL) <> ("resource_shares"."granted_to_email" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "change_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"patch" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"notes_font_family" text DEFAULT 'inter' NOT NULL,
	"notes_font_size" text DEFAULT 'md' NOT NULL,
	"notes_line_height" text DEFAULT 'normal' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_granted_to_user_id_users_id_fk" FOREIGN KEY ("granted_to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notebooks_workspace_id_idx" ON "notebooks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_id_idx" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "projects_notebook_id_idx" ON "projects" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "projects_created_by_user_id_idx" ON "projects" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "pages_workspace_id_idx" ON "pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pages_project_id_idx" ON "pages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pages_notebook_id_idx" ON "pages" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "pages_created_by_user_id_idx" ON "pages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_one_per_project_idx" ON "pages" USING btree ("project_id") WHERE deleted_at IS NULL AND project_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "canvases_workspace_id_idx" ON "canvases" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "canvases_project_id_idx" ON "canvases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "canvases_notebook_id_idx" ON "canvases" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "canvases_created_by_user_id_idx" ON "canvases" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canvases_one_per_project_idx" ON "canvases" USING btree ("project_id") WHERE deleted_at IS NULL AND project_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "resource_shares_resource_idx" ON "resource_shares" USING btree ("resource_kind","resource_id");--> statement-breakpoint
CREATE INDEX "resource_shares_user_idx" ON "resource_shares" USING btree ("granted_to_user_id");--> statement-breakpoint
CREATE INDEX "resource_shares_email_idx" ON "resource_shares" USING btree ("granted_to_email");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_shares_live_user_uniq" ON "resource_shares" USING btree ("resource_kind","resource_id","granted_to_user_id") WHERE status <> 'revoked' AND granted_to_user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_shares_live_email_uniq" ON "resource_shares" USING btree ("resource_kind","resource_id","granted_to_email") WHERE status <> 'revoked' AND granted_to_email IS NOT NULL;--> statement-breakpoint
CREATE INDEX "change_events_workspace_id_created_at_idx" ON "change_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "change_events_entity_idx" ON "change_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "change_events_user_id_created_at_idx" ON "change_events" USING btree ("user_id","created_at");