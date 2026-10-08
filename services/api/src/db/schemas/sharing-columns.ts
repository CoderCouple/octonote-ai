import { text, timestamp } from "drizzle-orm/pg-core";
import { linkAccess, shareRole } from "./enums";

/**
 * Google Docs-style "General access" + "Publish to web" columns, shared by
 * every shareable table. `publishedAt` non-null means published.
 */
export function sharingColumns() {
  return {
    linkAccess: linkAccess("link_access").default("restricted").notNull(),
    linkRole: shareRole("link_role").default("viewer").notNull(),
    publicSlug: text("public_slug").unique(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  };
}
