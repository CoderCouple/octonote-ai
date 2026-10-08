/**
 * Anonymous read access to published content (/pub/<slug>).
 *
 * A published notebook or project exposes its contents too, but only items
 * actually inside it: getChild verifies the requested item's ancestor chain
 * reaches the published root. Responses carry content only — no emails,
 * user ids or workspace details.
 */
import { Injectable } from "@nestjs/common";
import { NotFound } from "../common/error/error-factory";
import { CanvasesRepository } from "../db/repository/canvases.repository";
import { NotebooksRepository } from "../db/repository/notebooks.repository";
import { PagesRepository } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { SharingRepository, type ShareableRow } from "../db/repository/sharing.repository";
import type { ResourceKind } from "../model/sharing.model";

export interface PublicNote {
  kind: "page";
  id: string;
  title: string;
  document: unknown;
  contentMd: string;
  updatedAt: string;
}

export interface PublicCanvas {
  kind: "canvas";
  id: string;
  title: string;
  document: unknown;
  thumbnailUrl: string | null;
  updatedAt: string;
}

export interface PublicProject {
  kind: "project";
  id: string;
  name: string;
  description: string | null;
  defaultView: string | null;
  note: PublicNote | null;
  canvas: PublicCanvas | null;
  updatedAt: string;
}

export interface PublicNotebook {
  kind: "notebook";
  id: string;
  name: string;
  items: { kind: ResourceKind; id: string; title: string; updatedAt: string }[];
  updatedAt: string;
}

export type PublicResource = PublicNote | PublicCanvas | PublicProject | PublicNotebook;

export interface PublicView {
  /** The published entry point (what the slug points at). */
  root: { kind: ResourceKind; id: string; title: string; slug: string };
  resource: PublicResource;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly sharingRepo: SharingRepository,
    private readonly pagesRepo: PagesRepository,
    private readonly canvasesRepo: CanvasesRepository,
    private readonly projectsRepo: ProjectsRepository,
    private readonly notebooksRepo: NotebooksRepository,
  ) {}

  async getBySlug(slug: string): Promise<PublicView> {
    const root = await this.publishedRoot(slug);
    return { root: rootRef(root, slug), resource: await this.render(root.kind, root.id) };
  }

  /**
   * An item is readable under a published root if it's inside that root, or
   * if it's public in its own right (it or an ancestor is published) — e.g.
   * a canvas linked from a published note. Anything else is 404.
   */
  async getChild(slug: string, kind: ResourceKind, id: string): Promise<PublicView> {
    const root = await this.publishedRoot(slug);
    const target = { kind, id };
    if (!(await this.isWithin(target, root)) && !(await this.isPublished(target))) {
      throw NotFound("Not found.");
    }
    return { root: rootRef(root, slug), resource: await this.render(kind, id) };
  }

  private async isPublished(target: { kind: ResourceKind; id: string }): Promise<boolean> {
    let cursor: { kind: ResourceKind; id: string } | null = target;
    while (cursor) {
      const row = await this.sharingRepo.findResource(cursor.kind, cursor.id);
      if (!row) return false;
      if (row.publishedAt) return true;
      cursor = row.parent;
    }
    return false;
  }

  private async publishedRoot(slug: string): Promise<ShareableRow> {
    const root = await this.sharingRepo.findByPublicSlug(slug);
    if (!root || !root.publishedAt) throw NotFound("Not found.");
    return root;
  }

  private async isWithin(
    target: { kind: ResourceKind; id: string },
    root: ShareableRow,
  ): Promise<boolean> {
    let cursor: { kind: ResourceKind; id: string } | null = target;
    while (cursor) {
      if (cursor.kind === root.kind && cursor.id === root.id) return true;
      const row = await this.sharingRepo.findResource(cursor.kind, cursor.id);
      if (!row) return false;
      cursor = row.parent;
    }
    return false;
  }

  private async render(kind: ResourceKind, id: string): Promise<PublicResource> {
    switch (kind) {
      case "page":
        return this.renderNote(id);
      case "canvas":
        return this.renderCanvas(id);
      case "project":
        return this.renderProject(id);
      case "notebook":
        return this.renderNotebook(id);
    }
  }

  private async renderNote(id: string): Promise<PublicNote> {
    const row = await this.pagesRepo.findById(id);
    if (!row || row.deletedAt) throw NotFound("Not found.");
    return {
      kind: "page",
      id: row.id,
      title: row.title,
      document: row.document,
      contentMd: row.contentMd,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async renderCanvas(id: string): Promise<PublicCanvas> {
    const row = await this.canvasesRepo.findById(id);
    if (!row || row.deletedAt) throw NotFound("Not found.");
    return {
      kind: "canvas",
      id: row.id,
      title: row.title,
      document: row.document,
      thumbnailUrl: row.thumbnailUrl,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async renderProject(id: string): Promise<PublicProject> {
    const row = await this.projectsRepo.findById(id);
    if (!row || row.archivedAt) throw NotFound("Not found.");
    const [page, canvas] = await Promise.all([
      this.pagesRepo.findActiveByProject(id),
      this.canvasesRepo.findActiveByProject(id),
    ]);
    const settings = (row.settings ?? {}) as { defaultView?: string };
    return {
      kind: "project",
      id: row.id,
      name: row.name,
      description: row.description,
      defaultView: settings.defaultView ?? null,
      note: page ? await this.renderNote(page.id) : null,
      canvas: canvas ? await this.renderCanvas(canvas.id) : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async renderNotebook(id: string): Promise<PublicNotebook> {
    const row = await this.notebooksRepo.findById(id);
    if (!row) throw NotFound("Not found.");
    const [notes, canvases, projects] = await Promise.all([
      this.pagesRepo.listByNotebook(id),
      this.canvasesRepo.listByNotebook(id),
      this.projectsRepo.listByNotebook(id),
    ]);
    return {
      kind: "notebook",
      id: row.id,
      name: row.name,
      items: [
        ...notes.map((n) => ({ kind: "page" as const, id: n.id, title: n.title, updatedAt: n.updatedAt.toISOString() })),
        ...canvases.map((c) => ({ kind: "canvas" as const, id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })),
        ...projects.map((p) => ({ kind: "project" as const, id: p.id, title: p.name, updatedAt: p.updatedAt.toISOString() })),
      ],
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function rootRef(root: ShareableRow, slug: string) {
  return { kind: root.kind, id: root.id, title: root.title, slug };
}
