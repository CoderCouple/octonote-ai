CREATE TABLE "analytics_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_hashes" (
	"day" date NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "visitor_hashes_day_hash_pk" PRIMARY KEY("day","hash")
);
--> statement-breakpoint
ALTER TABLE "resource_views" ADD COLUMN "visitors" integer DEFAULT 0 NOT NULL;