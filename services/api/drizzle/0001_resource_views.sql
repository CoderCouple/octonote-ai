CREATE TABLE "resource_views" (
	"resource_kind" "resource_kind" NOT NULL,
	"resource_id" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "resource_views_resource_kind_resource_id_hour_pk" PRIMARY KEY("resource_kind","resource_id","hour")
);
