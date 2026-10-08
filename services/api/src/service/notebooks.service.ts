/**
 * Notebooks: folder-like collections. Deleting one never deletes its
 * contents — ON DELETE SET NULL moves them back to the top level.
 */
import { Injectable } from "@nestjs/common";
import type { NotebookCreate, NotebookUpdate } from "../api/v1/request/notebook.request";
import { ChangeEventsService } from "../common/change-events.service";
import { NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { CanvasesRepository, type CanvasSummaryRow } from "../db/repository/canvases.repository";
import { NotebooksRepository } from "../db/repository/notebooks.repository";
import { PagesRepository, type PageSummaryRow } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { toNotebook, type Notebook } from "../model/notebook.model";
import { toProject, type Project } from "../model/project.model";
import { WorkspacesService } from "./workspaces.service";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

export interface NotebookContents {
  notebook: Notebook;
  access: ResolvedAccess;
  notes: PageSummaryRow[];
  canvases: CanvasSummaryRow[];
  projects: Project[];
}

@Injectable()
export class NotebooksService {
  constructor(
    private readonly notebooksRepo: NotebooksRepository,
    private readonly pagesRepo: PagesRepository,
    private readonly canvasesRepo: CanvasesRepository,
    private readonly projectsRepo: ProjectsRepository,
    private readonly permissions: PermissionsService,
    private readonly workspacesService: WorkspacesService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async listForWorkspace(workspaceId: string, actorUserId: string): Promise<Notebook[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    const rows = await this.notebooksRepo.listByWorkspace(workspaceId);
    return rows.map(toNotebook);
  }

  async getContents(notebookId: string, actorUserId: string | null): Promise<NotebookContents> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "notebook", id: notebookId },
      "view",
    );
    const row = await this.notebooksRepo.findById(notebookId);
    if (!row) throw NotFound("Notebook not found.");
    const [notes, canvases, projects] = await Promise.all([
      this.pagesRepo.listByNotebook(notebookId),
      this.canvasesRepo.listByNotebook(notebookId),
      this.projectsRepo.listByNotebook(notebookId),
    ]);
    return {
      notebook: toNotebook(row),
      access,
      notes,
      canvases,
      projects: projects.map(toProject),
    };
  }

  async create(workspaceId: string, input: NotebookCreate, actorUserId: string): Promise<Notebook> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    const row = await this.notebooksRepo.insert({
      workspaceId,
      createdByUserId: actorUserId,
      name: input.name,
      icon: input.icon ?? null,
    });
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "notebook",
      entityId: row.id,
      action: "notebook.create",
      after: row,
    });
    return toNotebook(row);
  }

  async update(notebookId: string, patch: NotebookUpdate, actorUserId: string): Promise<Notebook> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "notebook", id: notebookId },
      "edit",
    );
    const updated = await this.notebooksRepo.updateById(notebookId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Notebook not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "notebook",
      entityId: notebookId,
      action: "notebook.update",
      patch,
    });
    return toNotebook(updated);
  }

  async delete(notebookId: string, actorUserId: string): Promise<void> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "notebook", id: notebookId },
      "manage",
    );
    const deleted = await this.notebooksRepo.hardDeleteById(notebookId);
    if (!deleted) throw NotFound("Notebook not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "notebook",
      entityId: notebookId,
      action: "notebook.delete",
      before: deleted,
    });
  }
}
