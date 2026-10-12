/**
 * Delete my account — permanently, from inside the app (App Store rule).
 *
 * What goes:
 *   - every workspace where you're the only member, with everything in it
 *     (notes, canvases, projects, notebooks, shares, analytics, audit log)
 *   - your user row, preferences, memberships and shares granted to you
 *   - pending invites sent to your email
 *   - canvas thumbnails of the deleted canvases (Supabase Storage)
 *   - your Supabase sign-in
 *
 * What stays (in workspaces other people still use): content you created
 * there is handed to an owner, shares you granted are credited to an owner,
 * and audit-log rows lose their link to you (user_id → null).
 *
 * Refused (409) if you're the only owner of a workspace that has other
 * members — they'd be left with an ownerless workspace.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, eq, inArray, ne } from "drizzle-orm";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { BadRequest, Conflict, ServerError } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { changeEvents } from "../db/schemas/audit";
import { canvases } from "../db/schemas/canvases";
import { notebooks } from "../db/schemas/notebooks";
import { pages } from "../db/schemas/pages";
import { projects } from "../db/schemas/projects";
import { resourceShares } from "../db/schemas/sharing";
import { users } from "../db/schemas/users";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";

/** Must match apps/web/src/features/canvas/constants.ts. */
export const THUMBNAIL_BUCKET = "canvas-thumbnails";

/** Supabase user id from our "usr_<uuid>" id. */
const supabaseUserId = (userId: string) => userId.replace(/^usr_/, "");

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  /**
   * `signedInEmail` comes from the verified session. Safe to retry: if the
   * data is already gone (an earlier attempt failed at the sign-in step),
   * only the Supabase sign-in is removed.
   */
  async deleteAccount(userId: string, signedInEmail: string, confirmEmail: string): Promise<void> {
    if (confirmEmail.trim().toLowerCase() !== signedInEmail.toLowerCase()) {
      throw BadRequest("Type your email address exactly to confirm.");
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) await this.deleteData(userId, user.email);

    const { error } = await this.supabase.auth.admin.deleteUser(supabaseUserId(userId));
    if (error) {
      this.logger.error(`Supabase user delete failed for ${userId}`, error);
      throw ServerError("Your data is deleted, but removing your sign-in failed. Please try again.");
    }
  }

  private async deleteData(userId: string, email: string): Promise<void> {

    // Decide, per workspace, whether it goes with you or stays with others.
    const mine = await this.db
      .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId));
    const doomed: string[] = [];
    const heirs = new Map<string, string>(); // workspaceId → who inherits your content
    for (const ws of mine) {
      const others = await this.db
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, ws.id), ne(workspaceMembers.userId, userId)));
      if (others.length === 0) {
        doomed.push(ws.id);
        continue;
      }
      const owner = others.find((o) => o.role === "OWNER");
      if (ws.role === "OWNER" && !owner) {
        throw Conflict(
          `You're the only owner of “${ws.name}”, which other people use. Make someone else an owner or delete the workspace first.`,
        );
      }
      heirs.set(ws.id, (owner ?? others[0]!).userId);
    }

    const thumbnails = doomed.length
      ? (
          await this.db
            .select({ url: canvases.thumbnailUrl })
            .from(canvases)
            .where(inArray(canvases.workspaceId, doomed))
        ).flatMap((r) => {
          const path = r.url?.split(`/${THUMBNAIL_BUCKET}/`)[1];
          return path ? [path] : [];
        })
      : [];

    await this.db.transaction(async (tx) => {
      // Content you made in workspaces that stay is handed to their owner.
      for (const [workspaceId, heir] of heirs) {
        for (const table of [pages, canvases, projects, notebooks]) {
          await tx
            .update(table)
            .set({ createdByUserId: heir })
            .where(and(eq(table.workspaceId, workspaceId), eq(table.createdByUserId, userId)));
        }
      }

      // Shares you granted on items that stay are credited to that workspace's owner.
      const granted = await tx
        .select({ id: resourceShares.id, workspaceId: resourceShares.workspaceId })
        .from(resourceShares)
        .where(eq(resourceShares.grantedByUserId, userId));
      for (const share of granted) {
        if (doomed.includes(share.workspaceId)) continue;
        const [owner] = await tx
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, share.workspaceId),
              eq(workspaceMembers.role, "OWNER"),
              ne(workspaceMembers.userId, userId),
            ),
          )
          .limit(1);
        if (owner) {
          await tx
            .update(resourceShares)
            .set({ grantedByUserId: owner.userId })
            .where(eq(resourceShares.id, share.id));
        } else {
          await tx.delete(resourceShares).where(eq(resourceShares.id, share.id));
        }
      }

      await tx.delete(resourceShares).where(eq(resourceShares.grantedToEmail, email.toLowerCase()));
      await tx.update(changeEvents).set({ userId: null }).where(eq(changeEvents.userId, userId));
      if (doomed.length) await tx.delete(workspaces).where(inArray(workspaces.id, doomed));
      await tx.delete(users).where(eq(users.id, userId));
    });

    // Thumbnails are unguessable public URLs; a cleanup failure is logged, not fatal.
    if (thumbnails.length) {
      const { error } = await this.supabase.storage.from(THUMBNAIL_BUCKET).remove(thumbnails);
      if (error) this.logger.error(`Thumbnail cleanup failed for ${userId}`, error);
    }
  }
}
