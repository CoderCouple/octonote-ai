CREATE TABLE "support_access_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "support_session_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"grant_id" text,
	"via" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "support_sessions_via" CHECK ("support_sessions"."via" in ('grant', 'override'))
);
--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_session_requests" ADD CONSTRAINT "support_session_requests_session_id_support_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."support_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_grant_id_support_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."support_access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_access_grants_user_idx" ON "support_access_grants" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "support_session_requests_session_idx" ON "support_session_requests" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_sessions_token_hash_idx" ON "support_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "support_sessions_target_idx" ON "support_sessions" USING btree ("target_user_id","created_at");--> statement-breakpoint
ALTER TABLE "support_access_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "support_session_requests" ENABLE ROW LEVEL SECURITY;
