CREATE TABLE "feedback_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"workspace_id" text,
	"workspace_name" text,
	"plan" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"message" text NOT NULL,
	"team_note" text,
	"screenshot_path" text,
	"platform" text,
	"app_version" text,
	"system" text,
	"device" text,
	"screen" text,
	"page" text,
	"time_zone" text,
	"city" text,
	"region" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_items_kind" CHECK ("feedback_items"."kind" in ('bug', 'feature')),
	CONSTRAINT "feedback_items_status" CHECK ("feedback_items"."status" in ('new', 'planned', 'done', 'wont_do'))
);
--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_items_created_idx" ON "feedback_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_items_user_idx" ON "feedback_items" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "feedback_items" ENABLE ROW LEVEL SECURITY;
