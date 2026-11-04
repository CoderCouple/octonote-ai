-- Notes saved before figures had their own links point straight at Storage. Move
-- them to /f/<id>.png; the canvas-figures bucket goes private after this.
UPDATE "pages"
SET "document" = regexp_replace("document"::text, 'https?://[^"''[:space:])]+/storage/v1/object/public/canvas-figures/(fig_[0-9a-f-]{36})\.png', 'https://octonote.ai/f/\1.png', 'g')::jsonb
WHERE "document"::text LIKE '%/storage/v1/object/public/canvas-figures/%';--> statement-breakpoint
UPDATE "pages"
SET "content_md" = regexp_replace("content_md", 'https?://[^"''[:space:])]+/storage/v1/object/public/canvas-figures/(fig_[0-9a-f-]{36})\.png', 'https://octonote.ai/f/\1.png', 'g')
WHERE "content_md" LIKE '%/storage/v1/object/public/canvas-figures/%';
