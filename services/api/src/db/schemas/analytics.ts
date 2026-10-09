import { date, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { resourceKind } from "./enums";

/**
 * Anonymous view counts for published pages: one row per resource per hour.
 * `visitors` counts people seen for the first time that UTC day. No visitor
 * data (IP, cookies, user agent, account) is ever stored here.
 */
export const resourceViews = pgTable(
  "resource_views",
  {
    resourceKind: resourceKind("resource_kind").notNull(),
    resourceId: text("resource_id").notNull(),
    /** Start of the UTC hour the views fall in. */
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    views: integer("views").default(0).notNull(),
    visitors: integer("visitors").default(0).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.resourceKind, table.resourceId, table.hour] }),
  }),
);

/**
 * Today's secret for hashing visitors (Plausible-style). A new one is made
 * each UTC day and older ones are deleted, so yesterday's hashes can never be
 * recomputed or linked to today's.
 */
export const analyticsSalts = pgTable("analytics_salts", {
  day: date("day", { mode: "string" }).primaryKey(),
  salt: text("salt").notNull(),
});

/**
 * One-way hashes of (salt, resource, visitor) for the current day only, used
 * to count each visitor once per day. Purged when the day's salt rotates.
 */
export const visitorHashes = pgTable(
  "visitor_hashes",
  {
    day: date("day", { mode: "string" }).notNull(),
    hash: text("hash").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.day, table.hash] }),
  }),
);
