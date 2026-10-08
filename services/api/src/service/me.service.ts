/**
 * "Who am I?" sync. Runs on every dashboard load. Side-effects:
 *
 *   - upserts the user row (Supabase JWT → users)
 *   - converts pending share invites for this email into active grants
 *   - if the user has zero memberships, bootstraps a personal workspace
 *     (and seeds them as OWNER)
 *
 * Wraps the work in a single Drizzle transaction so partial failures don't
 * leave inconsistent membership state. This service has direct DB access
 * (rather than going through repositories) for that atomicity — we'd need
 * tx-aware repos to do this cleanly any other way.
 */
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { BadRequest } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { users } from "../db/schemas/users";
import { resourceShares } from "../db/schemas/sharing";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";
import { toUser, type User } from "../model/user.model";
import { toWorkspace, toWorkspaceMember, type Workspace, type WorkspaceMember } from "../model/workspace.model";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "workspace"
  );
}

interface MeResult {
  user: User;
  memberships: Array<{ membership: WorkspaceMember; workspace: Workspace }>;
}

@Injectable()
export class MeService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async sync(supabaseUser: SupabaseUser & { id: string }): Promise<MeResult> {
    const email = supabaseUser.email;
    if (!email) throw BadRequest("Supabase user has no email.");

    const meta = supabaseUser.user_metadata ?? {};
    const name =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      (email.split("@")[0] ?? email);
    const avatarUrl = (meta.avatar_url as string | undefined) ?? null;

    return this.db.transaction(async (tx) => {
      const [userRow] = await tx
        .insert(users)
        .values({ id: supabaseUser.id, email, name, avatarUrl })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, name, avatarUrl, updatedAt: new Date() },
        })
        .returning();
      if (!userRow) throw BadRequest("Failed to upsert user.");

      // Pending share invites sent to this email become active grants.
      // Supabase verifies email ownership before issuing a session, so the
      // JWT email is trusted here.
      await tx
        .update(resourceShares)
        .set({
          grantedToUserId: userRow.id,
          grantedToEmail: null,
          status: "active",
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(resourceShares.grantedToEmail, email.toLowerCase()),
            eq(resourceShares.status, "pending"),
          ),
        );

      let memberships = await tx
        .select({ membership: workspaceMembers, workspace: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(eq(workspaceMembers.userId, userRow.id));

      if (memberships.length === 0) {
        const localPart = email.split("@")[0] ?? "user";
        const slug = `${slugify(localPart)}-${userRow.id.slice(0, 6)}`;
        const workspaceName = `${name}'s workspace`;
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: workspaceName, slug })
          .returning();
        if (!workspace) throw BadRequest("Failed to bootstrap workspace.");
        const [membership] = await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: userRow.id, role: "OWNER" })
          .returning();
        if (!membership) throw BadRequest("Failed to seed owner membership.");
        memberships = [{ membership, workspace }];
      }

      return {
        user: toUser(userRow),
        memberships: memberships.map((m) => ({
          membership: toWorkspaceMember(m.membership),
          workspace: toWorkspace(m.workspace),
        })),
      };
    });
  }
}
