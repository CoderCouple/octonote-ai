import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { generateId } from "@octonote/shared";
import { resourceKind, shareRole, shareStatus } from "./enums";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * "People with access". A grant targets either a known user, or an email
 * that has no account yet (status 'pending' until they sign up).
 */
export const resourceShares = pgTable(
  "resource_shares",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("shr")),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    resourceKind: resourceKind("resource_kind").notNull(),
    resourceId: text("resource_id").notNull(),
    grantedToUserId: text("granted_to_user_id").references(() => users.id, { onDelete: "cascade" }),
    grantedToEmail: text("granted_to_email"),
    role: shareRole("role").default("viewer").notNull(),
    status: shareStatus("status").default("active").notNull(),
    grantedByUserId: text("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    subjectXor: check(
      "resource_shares_subject_xor",
      sql`(${table.grantedToUserId} IS NULL) <> (${table.grantedToEmail} IS NULL)`,
    ),
    resourceIdx: index("resource_shares_resource_idx").on(table.resourceKind, table.resourceId),
    userIdx: index("resource_shares_user_idx").on(table.grantedToUserId),
    pendingEmailIdx: index("resource_shares_email_idx").on(table.grantedToEmail),
    oneLiveGrantPerUser: uniqueIndex("resource_shares_live_user_uniq")
      .on(table.resourceKind, table.resourceId, table.grantedToUserId)
      .where(sql`status <> 'revoked' AND granted_to_user_id IS NOT NULL`),
    oneLiveGrantPerEmail: uniqueIndex("resource_shares_live_email_uniq")
      .on(table.resourceKind, table.resourceId, table.grantedToEmail)
      .where(sql`status <> 'revoked' AND granted_to_email IS NOT NULL`),
  }),
);
