import { generateId } from "@octonote/shared";
import { index, pgTable, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { resourceKind } from "./enums";
import { users } from "./users";

/**
 * Up/down votes on published content: one row per reader per item, value
 * +1 or -1 (removing a vote deletes the row). Readers must be signed in.
 */
export const resourceVotes = pgTable(
  "resource_votes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("vot")),
    resourceKind: resourceKind("resource_kind").notNull(),
    resourceId: text("resource_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    oneVoteEach: uniqueIndex("resource_votes_resource_user_idx").on(
      table.resourceKind,
      table.resourceId,
      table.userId,
    ),
    resourceIdx: index("resource_votes_resource_idx").on(table.resourceKind, table.resourceId),
  }),
);
