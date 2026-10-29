ALTER TABLE "canvases" ADD COLUMN "document_format" text DEFAULT 'tldraw' NOT NULL;--> statement-breakpoint
ALTER TABLE "canvases" ADD COLUMN "document_tldraw" jsonb;