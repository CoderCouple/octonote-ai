ALTER TABLE "figure_embeds" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Figures on canvases that were never opened in a browser get their record now.
-- Items whose ids aren't figure ids get theirs on the next save or open.
INSERT INTO "canvas_figures" ("id", "canvas_id", "workspace_id", "title", "created_by_user_id")
SELECT DISTINCT ON (item->>'id')
  item->>'id', c."id", c."workspace_id",
  COALESCE(NULLIF(trim((regexp_match(item->>'source', '^\s*title\s+(.+)$', 'n'))[1]), ''), 'Figure'),
  c."created_by_user_id"
FROM "canvases" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c."document"->'items') = 'array' THEN c."document"->'items' ELSE '[]'::jsonb END
) AS item
WHERE c."deleted_at" IS NULL
  AND item->>'type' = 'figure'
  AND item->>'id' ~ '^fig_[0-9a-f-]{36}$'
ORDER BY item->>'id', c."updated_at" DESC
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Notes that already showed those figures keep showing them to their readers.
INSERT INTO "figure_embeds" ("page_id", "figure_id")
SELECT DISTINCT p."id", found.figure_id
FROM "pages" p
CROSS JOIN LATERAL (
  SELECT value #>> '{}' AS figure_id FROM jsonb_path_query(p."document", '$.**.figureId') AS value
) found
JOIN "canvas_figures" f ON f."id" = found.figure_id
ON CONFLICT DO NOTHING;
