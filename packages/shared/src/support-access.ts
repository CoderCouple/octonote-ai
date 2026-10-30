/**
 * Support access: staff view a user's account read-only to reproduce a bug.
 * Normally the user grants it first (Settings → Privacy); an admin may
 * override in an emergency with a written reason (audited, and listed in
 * the user's Settings).
 * Every session is short, audited and read-only (the API refuses writes).
 */
import { z } from "zod";

/** Bearer tokens for support sessions; the auth guards recognise them. */
export const SUPPORT_TOKEN_PREFIX = "ons_";
export const SUPPORT_SESSION_MINUTES = 30;
/** Cookie on the main site that holds a running session's token. */
export const SUPPORT_COOKIE = "octonote_support";

export const SupportGrantSchema = z.object({
  days: z.union([z.literal(1), z.literal(7)]),
});
export type SupportGrantInput = z.infer<typeof SupportGrantSchema>;

export const SupportSessionStartSchema = z.object({
  userId: z.string().min(1).max(64),
  reason: z.string().trim().min(10, "Say why, in a sentence.").max(500),
  /** Enter without the user's grant (emergencies; reason required, audited). */
  override: z.boolean().default(false),
});
export type SupportSessionStartInput = z.infer<typeof SupportSessionStartSchema>;

export type SupportSessionVia = "grant" | "override";

/** A past or running session, as the user sees it in Settings. */
export interface SupportSessionSummary {
  id: string;
  via: SupportSessionVia;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
}

/** Settings → Privacy → Support access. */
export interface SupportAccessStatus {
  /** When the current grant ends; null when support can't enter. */
  grantedUntil: string | null;
  sessions: SupportSessionSummary[];
}

/** Admin → a person → Support access. */
export interface AdminSupportStatus {
  grantedUntil: string | null;
  sessions: (SupportSessionSummary & { adminEmail: string; reason: string; requests: number })[];
}

export interface SupportSessionStarted {
  id: string;
  /** Shown once; the portal hands it to the main site's /support-enter. */
  token: string;
  expiresAt: string;
}

/** The banner in a support tab. */
export interface SupportSessionInfo {
  id: string;
  via: SupportSessionVia;
  userName: string;
  userEmail: string;
  adminEmail: string;
  expiresAt: string;
}
