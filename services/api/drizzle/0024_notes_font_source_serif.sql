-- Notes read in a book face by default (Source Serif, Medium/Substack style).
-- Inter was the default and every preferences row got it automatically, so
-- those move too; Inter stays one click away in the typography picker.
ALTER TABLE "user_preferences" ALTER COLUMN "notes_font_family" SET DEFAULT 'source-serif';--> statement-breakpoint
UPDATE "user_preferences" SET "notes_font_family" = 'source-serif' WHERE "notes_font_family" = 'inter';
