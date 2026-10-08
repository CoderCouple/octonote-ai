/**
 * Google Docs / Drive-style access resolution. Every read and write of a
 * note, canvas, project or notebook goes through here.
 *
 * Walks the containment chain (note/canvas → project → notebook) and takes
 * the highest role granted by any of:
 *   - workspace membership: OWNER/ADMIN → owner, MEMBER → editor
 *   - having created any resource in the chain → owner
 *   - an active per-person share on any resource in the chain
 *   - "anyone with the link" on any resource in the chain (anonymous
 *     callers are capped at viewer — editing requires sign-in)
 *
 * No access at all → 404, so private resources aren't revealed to exist.
 */
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull, or } from "drizzle-orm";
import { Database, DRIZZLE } from "../db/database.module";
import {
  canvases,
  notebooks,
  pages,
  projects,
  resourceShares,
  workspaceMembers,
} from "../db/schema";

export type ResourceKind = "page" | "canvas" | "project" | "notebook";
export type Role = "viewer" | "editor" | "owner";
export type ShareRole = "viewer" | "editor";

/**
 * - view:   read content
 * - edit:   change content / title
 * - share:  add or remove people (editors can share, as in Google Docs)
 * - manage: general access, publish, move, delete
 */
export type Action = "view" | "edit" | "share" | "manage";

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

const ACTION_REQUIREMENT: Record<Action, Role> = {
  view: "viewer",
  edit: "editor",
  share: "editor",
  manage: "owner",
};

export interface ResourceLocator {
  kind: ResourceKind;
  id: string;
}

export interface ResolvedAccess {
  workspaceId: string;
  role: Role;
  isWorkspaceMember: boolean;
}

interface ChainNode {
  kind: ResourceKind;
  id: string;
  workspaceId: string;
  createdByUserId: string;
  linkAccess: "restricted" | "anyone_with_link";
  linkRole: ShareRole;
  parent: ResourceLocator | null;
}

function maxRole(a: Role | null, b: Role | null): Role | null {
  if (!a) return b;
  if (!b) return a;
  return ROLE_RANK[b] > ROLE_RANK[a] ? b : a;
}

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** `userId` null = anonymous visitor. */
  async resolve(userId: string | null, locator: ResourceLocator): Promise<ResolvedAccess> {
    const chain = await this.loadChain(locator);
    const workspaceId = chain[0]!.workspaceId;
    let role: Role | null = null;
    let isWorkspaceMember = false;

    for (const node of chain) {
      if (node.linkAccess === "anyone_with_link") {
        role = maxRole(role, userId ? node.linkRole : "viewer");
      }
    }

    if (userId) {
      const [member] = await this.db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)),
        )
        .limit(1);
      if (member) {
        isWorkspaceMember = true;
        role = maxRole(role, member.role === "MEMBER" ? "editor" : "owner");
      }

      if (chain.some((n) => n.createdByUserId === userId)) role = "owner";

      const shares = await this.db
        .select({ role: resourceShares.role })
        .from(resourceShares)
        .where(
          and(
            eq(resourceShares.grantedToUserId, userId),
            eq(resourceShares.status, "active"),
            or(
              ...chain.map((n) =>
                and(eq(resourceShares.resourceKind, n.kind), eq(resourceShares.resourceId, n.id)),
              ),
            ),
          ),
        );
      for (const s of shares) role = maxRole(role, s.role);
    }

    if (!role) throw new NotFoundException("Resource not found.");
    return { workspaceId, role, isWorkspaceMember };
  }

  assert(access: ResolvedAccess, action: Action): void {
    if (ROLE_RANK[access.role] < ROLE_RANK[ACTION_REQUIREMENT[action]]) {
      throw new ForbiddenException(`Insufficient permission to ${action} this resource.`);
    }
  }

  async require(
    userId: string | null,
    locator: ResourceLocator,
    action: Action,
  ): Promise<ResolvedAccess> {
    const access = await this.resolve(userId, locator);
    this.assert(access, action);
    return access;
  }

  /** The resource first, then its ancestors. Throws 404 if the resource is missing or deleted. */
  private async loadChain(locator: ResourceLocator): Promise<ChainNode[]> {
    const chain: ChainNode[] = [];
    let next: ResourceLocator | null = locator;
    while (next) {
      const node = await this.loadNode(next);
      if (!node) {
        if (chain.length === 0) throw new NotFoundException("Resource not found.");
        break;
      }
      chain.push(node);
      next = node.parent;
    }
    return chain;
  }

  private async loadNode(locator: ResourceLocator): Promise<ChainNode | null> {
    switch (locator.kind) {
      case "page": {
        const [row] = await this.db
          .select()
          .from(pages)
          .where(and(eq(pages.id, locator.id), isNull(pages.deletedAt)))
          .limit(1);
        if (!row) return null;
        return {
          kind: "page",
          ...pickCommon(row),
          parent: itemParent(row.projectId, row.notebookId),
        };
      }
      case "canvas": {
        const [row] = await this.db
          .select()
          .from(canvases)
          .where(and(eq(canvases.id, locator.id), isNull(canvases.deletedAt)))
          .limit(1);
        if (!row) return null;
        return {
          kind: "canvas",
          ...pickCommon(row),
          parent: itemParent(row.projectId, row.notebookId),
        };
      }
      case "project": {
        const [row] = await this.db
          .select()
          .from(projects)
          .where(eq(projects.id, locator.id))
          .limit(1);
        if (!row) return null;
        return {
          kind: "project",
          ...pickCommon(row),
          parent: row.notebookId ? { kind: "notebook", id: row.notebookId } : null,
        };
      }
      case "notebook": {
        const [row] = await this.db
          .select()
          .from(notebooks)
          .where(eq(notebooks.id, locator.id))
          .limit(1);
        if (!row) return null;
        return { kind: "notebook", ...pickCommon(row), parent: null };
      }
    }
  }
}

function pickCommon(row: {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  linkAccess: "restricted" | "anyone_with_link";
  linkRole: ShareRole;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    linkAccess: row.linkAccess,
    linkRole: row.linkRole,
  };
}

function itemParent(projectId: string | null, notebookId: string | null): ResourceLocator | null {
  if (projectId) return { kind: "project", id: projectId };
  if (notebookId) return { kind: "notebook", id: notebookId };
  return null;
}
