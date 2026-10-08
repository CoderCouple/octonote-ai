/**
 * Business logic for workspaces. All HTTP, validation, and presentation
 * concerns belong to the controller layer above; all DB queries belong to
 * the repositories below. This sits in the middle and owns:
 *
 *   - create / rename / delete invariants
 *   - slug allocation (unique per workspace table)
 *   - membership role gating (OWNER / ADMIN / MEMBER)
 *   - audit logging
 */
import { Inject, Injectable } from "@nestjs/common";
import type {
  WorkspaceCreate,
  WorkspaceUpdate,
} from "../api/v1/request/workspace.request";
import { ChangeEventsService } from "../common/change-events.service";
import { Conflict, Forbidden, NotFound } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import { WorkspacesRepository } from "../db/repository/workspaces.repository";
import { workspaceMembers, workspaces } from "../db/schemas/workspaces";
import {
  toWorkspace,
  toWorkspaceMember,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from "../model/workspace.model";

function baseSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "workspace"
  );
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 7);
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workspacesRepo: WorkspacesRepository,
    private readonly membersRepo: WorkspaceMembersRepository,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  /** Create a workspace and seed the caller as its OWNER. */
  async create(
    input: WorkspaceCreate,
    actorUserId: string,
  ): Promise<{ workspace: Workspace; ownerMembership: WorkspaceMember }> {
    const slug = await this.allocateSlug(input.slug ?? input.name);

    const result = await this.db.transaction(async (tx) => {
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: input.name.trim(), slug })
        .returning();
      if (!workspace) throw NotFound("Workspace insert returned no row.");

      const [membership] = await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId: actorUserId, role: "OWNER" })
        .returning();
      if (!membership) throw NotFound("Owner membership insert returned no row.");

      return { workspace, membership };
    });

    // Audit log runs against the outer (committed) connection so the FK
    // change_events → workspaces resolves correctly.
    await this.changeEvents.record({
      workspaceId: result.workspace.id,
      userId: actorUserId,
      entityType: "workspace",
      entityId: result.workspace.id,
      action: "workspace.create",
      after: result.workspace,
    });

    return {
      workspace: toWorkspace(result.workspace),
      ownerMembership: toWorkspaceMember(result.membership),
    };
  }

  /** Rename or change slug. OWNER/ADMIN only. */
  async update(
    workspaceId: string,
    patch: WorkspaceUpdate,
    actorUserId: string,
  ): Promise<Workspace> {
    await this.requireRole(actorUserId, workspaceId, ["OWNER", "ADMIN"]);
    const existing = await this.workspacesRepo.findById(workspaceId);
    if (!existing) throw NotFound("Workspace not found.");

    if (patch.slug && patch.slug !== existing.slug) {
      const taken = await this.workspacesRepo.slugIsTaken(patch.slug);
      if (taken) throw Conflict("Slug already in use.");
    }

    const updated = await this.workspacesRepo.updateById(workspaceId, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Workspace not found.");

    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "workspace",
      entityId: workspaceId,
      action: "workspace.update",
      before: existing,
      after: updated,
      patch,
    });
    return toWorkspace(updated);
  }

  /** Hard-delete a workspace and all its dependent rows (FKs cascade). OWNER only. */
  async remove(workspaceId: string, actorUserId: string): Promise<void> {
    await this.requireRole(actorUserId, workspaceId, ["OWNER"]);
    const existing = await this.workspacesRepo.findById(workspaceId);
    if (!existing) throw NotFound("Workspace not found.");

    // Audit before delete — once the workspace is gone the FK on
    // change_events.workspace_id can't resolve.
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "workspace",
      entityId: workspaceId,
      action: "workspace.delete",
      before: existing,
    });
    await this.workspacesRepo.deleteById(workspaceId);
  }

  /** Throws Forbidden if `userId` is missing or has an excluded role. */
  async requireRole(
    userId: string,
    workspaceId: string,
    allowed: WorkspaceRole[],
  ): Promise<WorkspaceRole> {
    const member = await this.membersRepo.findOne(workspaceId, userId);
    if (!member) throw Forbidden("Not a member of this workspace.");
    if (!allowed.includes(member.role)) {
      throw Forbidden(`Requires ${allowed.join(" or ")}.`);
    }
    return member.role;
  }

  private async allocateSlug(seed: string): Promise<string> {
    const root = baseSlug(seed);
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? root : `${root}-${randomTag()}`;
      if (!(await this.workspacesRepo.slugIsTaken(candidate))) return candidate;
    }
    return `${root}-${randomTag()}${randomTag()}`;
  }
}
