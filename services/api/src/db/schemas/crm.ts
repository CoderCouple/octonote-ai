import { generateId } from "@octonote/shared";
import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The follow-ups CRM in the admin portal (Admin → Inbox). Staff keep track of
 * the people who signed up: where each one stands, every conversation with
 * them, and when to follow up. Nothing here is visible to the people themselves.
 */

/** One row per person staff have touched: their status and who looks after them. */
export const crmContacts = pgTable(
  "crm_contacts",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** new | contacted | replied | using | paying | not_interested */
    status: text("status").default("new").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "crm_contacts_status",
      sql`${t.status} in ('new', 'contacted', 'replied', 'using', 'paying', 'not_interested')`,
    ),
  ],
);

/**
 * The timeline: conversations logged by staff (LinkedIn, calls, notes) and
 * emails sent or received. Things we already know (signed up, first note,
 * payments) aren't stored here; they're read from their own tables.
 */
export const crmEntries = pgTable(
  "crm_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("crm")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** note | linkedin | call | whatsapp | meeting | email_out | email_in */
    kind: text("kind").notNull(),
    subject: text("subject"),
    body: text("body").default("").notNull(),
    /** The staff member who logged or sent it; null for received emails. */
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** When it happened (a logged call can be from yesterday). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    /** Resend's id for emails sent or received, so webhook retries count once. */
    providerEmailId: text("provider_email_id").unique(),
    /** A received email: the email of ours it answers. */
    replyToEntryId: text("reply_to_entry_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("crm_entries_user_idx").on(t.userId, t.occurredAt),
    check(
      "crm_entries_kind",
      sql`${t.kind} in ('note', 'linkedin', 'call', 'whatsapp', 'meeting', 'email_out', 'email_in')`,
    ),
  ],
);

/** "Follow up with Maya on Oct 24: answer her PDF question." Open until done. */
export const crmFollowups = pgTable(
  "crm_followups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId("fup")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    note: text("note").notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("crm_followups_user_idx").on(t.userId),
    index("crm_followups_open_idx").on(t.dueOn).where(sql`${t.doneAt} is null`),
  ],
);
