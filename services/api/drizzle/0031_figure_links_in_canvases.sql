-- Canvas thumbnails (and any pictures on a canvas) can point at a figure's old
-- Storage link too; that bucket is private now.
UPDATE "canvases"
SET "thumbnail_url" = regexp_replace("thumbnail_url", 'https?://[^"''[:space:])]+/storage/v1/object/public/canvas-figures/(fig_[0-9a-f-]{36})\.png', 'https://octonote.ai/f/\1.png', 'g')
WHERE "thumbnail_url" LIKE '%/storage/v1/object/public/canvas-figures/%';--> statement-breakpoint
UPDATE "canvases"
SET "document" = regexp_replace("document"::text, 'https?://[^"''[:space:])]+/storage/v1/object/public/canvas-figures/(fig_[0-9a-f-]{36})\.png', 'https://octonote.ai/f/\1.png', 'g')::jsonb
WHERE "document"::text LIKE '%/storage/v1/object/public/canvas-figures/%';
