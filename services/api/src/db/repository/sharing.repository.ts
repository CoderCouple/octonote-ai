/**
 * Cross-table access to the shareable resources (pages, canvases, projects,
 * notebooks) by kind, plus the resource_shares table. Keeps the sharing
 * services free of per-kind switch statements.
 */
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { Database, DRIZZLE } from "../database.module";
import { canvases } from "../schemas/canvases";
import { notebooks } from "../schemas/notebooks";
import { pages } from "../schemas/pages";
import { projects } from "../schemas/projects";
import { resourceShares } from "../schemas/sharing";
import { users } from "../schemas/users";
import type { LinkAccess, ResourceKind, ShareRole } from "../../model/sharing.model";
import { BaseRepository } from "./base.repository";

export interface ShareableRow {
  kind: ResourceKind;
  id: string;
  workspaceId: string;
  title: string;
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  publicSlug: string | null;
  publishedAt: Date | null;
  /** Containment parent, mirroring PermissionsService's chain. */
  parent: { kind: ResourceKind; id: string } | null;
}

type SharingPatch = Partial<{
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  publicSlug: string;
  publishedAt: Date | null;
}>;

@Injectable()
export class SharingRepository extends BaseRepository<typeof resourceShares> {
  constructor(@Inject(DRIZZLE) db: Database) {
    super(db, resourceShares);
  }

  async findResource(kind: ResourceKind, id: string): Promise<ShareableRow | null> {
    switch (kind) {
      case "page": {
        const [r] = await this.db
          .select()
          .from(pages)
          .where(and(eq(pages.id, id), isNull(pages.deletedAt)))
          .limit(1);
        return r ? { kind, ...common(r), title: r.title, parent: itemParent(r) } : null;
      }
      case "canvas": {
        const [r] = await this.db
          .select()
          .from(canvases)
          .where(and(eq(canvases.id, id), isNull(canvases.deletedAt)))
          .limit(1);
        return r ? { kind, ...common(r), title: r.title, parent: itemParent(r) } : null;
      }
      case "project": {
        const [r] = await this.db
          .select()
          .from(projects)
          .where(and(eq(projects.id, id), isNull(projects.archivedAt)))
          .limit(1);
        return r
          ? {
              kind,
              ...common(r),
              title: r.name,
              parent: r.notebookId ? { kind: "notebook", id: r.notebookId } : null,
            }
          : null;
      }
      case "notebook": {
        const [r] = await this.db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
        return r ? { kind, ...common(r), title: r.name, parent: null } : null;
      }
    }
  }

  /** Published resource by its public slug; slugs are globally unique. */
  async findByPublicSlug(slug: string): Promise<ShareableRow | null> {
    for (const [kind, table] of [
      ["page", pages],
      ["canvas", canvases],
      ["project", projects],
      ["notebook", notebooks],
    ] as const) {
      const [r] = await this.db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.publicSlug, slug))
        .limit(1);
      if (r) return this.findResource(kind, r.id);
    }
    return null;
  }

  async updateSharing(kind: ResourceKind, id: string, patch: SharingPatch): Promise<void> {
    const set = { ...patch, updatedAt: new Date() };
    switch (kind) {
      case "page":
        await this.db.update(pages).set(set).where(eq(pages.id, id));
        return;
      case "canvas":
        await this.db.update(canvases).set(set).where(eq(canvases.id, id));
        return;
      case "project":
        await this.db.update(projects).set(set).where(eq(projects.id, id));
        return;
      case "notebook":
        await this.db.update(notebooks).set(set).where(eq(notebooks.id, id));
        return;
    }
  }

  /** Non-revoked grants on a resource, with the grantee's user row when known. */
  listForResource(kind: ResourceKind, id: string) {
    return this.db
      .select({ share: resourceShares, user: users })
      .from(resourceShares)
      .leftJoin(users, eq(resourceShares.grantedToUserId, users.id))
      .where(
        and(
          eq(resourceShares.resourceKind, kind),
          eq(resourceShares.resourceId, id),
          ne(resourceShares.status, "revoked"),
        ),
      )
      .orderBy(resourceShares.createdAt);
  }

  async findLiveGrant(kind: ResourceKind, id: string, userId: string | null, email: string) {
    const [row] = await this.db
      .select()
      .from(resourceShares)
      .where(
        and(
          eq(resourceShares.resourceKind, kind),
          eq(resourceShares.resourceId, id),
          ne(resourceShares.status, "revoked"),
          userId
            ? eq(resourceShares.grantedToUserId, userId)
            : eq(resourceShares.grantedToEmail, email),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Active grants to a user — powers "Shared with me". */
  listActiveForUser(userId: string) {
    return this.db
      .select()
      .from(resourceShares)
      .where(and(eq(resourceShares.grantedToUserId, userId), eq(resourceShares.status, "active")))
      .orderBy(desc(resourceShares.updatedAt));
  }

  async findUserByEmail(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }

  async findUsersByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.db.select().from(users).where(inArray(users.id, ids));
  }

  async findResources(refs: { kind: ResourceKind; id: string }[]) {
    const out: ShareableRow[] = [];
    for (const ref of refs) {
      const row = await this.findResource(ref.kind, ref.id);
      if (row) out.push(row);
    }
    return out;
  }
}

function common(r: {
  id: string;
  workspaceId: string;
  linkAccess: LinkAccess;
  linkRole: ShareRole;
  publicSlug: string | null;
  publishedAt: Date | null;
}) {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    linkAccess: r.linkAccess,
    linkRole: r.linkRole,
    publicSlug: r.publicSlug,
    publishedAt: r.publishedAt,
  };
}

function itemParent(r: { projectId: string | null; notebookId: string | null }) {
  if (r.projectId) return { kind: "project" as const, id: r.projectId };
  if (r.notebookId) return { kind: "notebook" as const, id: r.notebookId };
  return null;
}
