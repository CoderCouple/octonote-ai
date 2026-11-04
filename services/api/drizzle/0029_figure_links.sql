CREATE TABLE "figure_embeds" (
	"page_id" text NOT NULL,
	"figure_id" text NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figure_embeds_page_id_figure_id_pk" PRIMARY KEY("page_id","figure_id")
);
--> statement-breakpoint
ALTER TABLE "canvas_figures" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "figure_embeds" ADD CONSTRAINT "figure_embeds_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_embeds" ADD CONSTRAINT "figure_embeds_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figure_embeds_figure_id_idx" ON "figure_embeds" USING btree ("figure_id");--> statement-breakpoint
ALTER TABLE "figure_embeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Notes that already show figures keep showing them to their readers.
INSERT INTO "figure_embeds" ("page_id", "figure_id")
SELECT DISTINCT p."id", found.figure_id
FROM "pages" p
CROSS JOIN LATERAL (
  SELECT value #>> '{}' AS figure_id FROM jsonb_path_query(p."document", '$.**.figureId') AS value
) found
JOIN "canvas_figures" f ON f."id" = found.figure_id
ON CONFLICT DO NOTHING;
