/**
 * Projects: eraser-style files that own exactly one note and one canvas.
 * The pair is created with the project, renamed with it (unless the user
 * retitled a child), and soft-deleted when the project is archived.
 */
import { Injectable } from "@nestjs/common";
import type { ProjectCreate, ProjectUpdate } from "../api/v1/request/project.request";
import { ChangeEventsService } from "../common/change-events.service";
import { NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { CanvasesRepository } from "../db/repository/canvases.repository";
import { PagesRepository } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { toProject, type Project } from "../model/project.model";
import { NotebookPlacement } from "./lib/notebook-placement";
import { expectedChildTitle, isAutoTitle } from "./lib/project-child-naming";
import { WorkspacesService } from "./workspaces.service";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

export interface ProjectWithPair {
  project: Project;
  noteId: string | null;
  canvasId: string | null;
  access: ResolvedAccess;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepo: ProjectsRepository,
    private readonly pagesRepo: PagesRepository,
    private readonly canvasesRepo: CanvasesRepository,
    private readonly permissions: PermissionsService,
    private readonly placement: NotebookPlacement,
    private readonly workspacesService: WorkspacesService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async listForWorkspace(workspaceId: string, actorUserId: string): Promise<Project[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    const rows = await this.projectsRepo.listByWorkspace(workspaceId);
    return rows.map(toProject);
  }

  async getOne(projectId: string, actorUserId: string | null): Promise<ProjectWithPair> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "project", id: projectId },
      "view",
    );
    const row = await this.projectsRepo.findById(projectId);
    if (!row) throw NotFound("Project not found.");
    const [page, canvas] = await Promise.all([
      this.pagesRepo.findActiveByProject(projectId),
      this.canvasesRepo.findActiveByProject(projectId),
    ]);
    return {
      project: toProject(row),
      noteId: page?.id ?? null,
      canvasId: canvas?.id ?? null,
      access,
    };
  }

  async create(
    workspaceId: string,
    input: ProjectCreate,
    actorUserId: string,
  ): Promise<{ project: Project; noteId: string; canvasId: string }> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    if (input.notebookId) {
      await this.placement.assertCanPlaceIn(input.notebookId, workspaceId, actorUserId);
    }
    const { project, page, canvas } = await this.projectsRepo.insertWithPair({
      project: {
        workspaceId,
        notebookId: input.notebookId ?? null,
        createdByUserId: actorUserId,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
      },
      noteTitle: expectedChildTitle(input.name, "Note"),
      canvasTitle: expectedChildTitle(input.name, "Canvas"),
    });
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "project",
      entityId: project.id,
      action: "project.create",
      after: { project, noteId: page.id, canvasId: canvas.id },
    });
    return { project: toProject(project), noteId: page.id, canvasId: canvas.id };
  }

  async update(projectId: string, patch: ProjectUpdate, actorUserId: string): Promise<Project> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "project", id: projectId },
      "edit",
    );
    const existing = await this.projectsRepo.findById(projectId);
    if (!existing) throw NotFound("Project not found.");

    const updated = await this.projectsRepo.updateById(projectId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.settings !== undefined ? { settings: patch.settings as never } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Project not found.");

    if (patch.name !== undefined && patch.name !== existing.name) {
      await this.cascadeRename(projectId, existing.name, patch.name);
    }

    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "project",
      entityId: projectId,
      action: "project.update",
      before: existing,
      after: updated,
      patch,
    });
    return toProject(updated);
  }

  async moveToNotebook(
    projectId: string,
    notebookId: string | null,
    actorUserId: string,
  ): Promise<Project> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "project", id: projectId },
      "manage",
    );
    const existing = await this.projectsRepo.findById(projectId);
    if (!existing) throw NotFound("Project not found.");
    if (notebookId) {
      await this.placement.assertCanPlaceIn(notebookId, access.workspaceId, actorUserId);
    }
    const updated = await this.projectsRepo.updateById(projectId, {
      notebookId,
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Project not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "project",
      entityId: projectId,
      action: "project.move",
      before: { notebookId: existing.notebookId },
      after: { notebookId },
    });
    return toProject(updated);
  }

  /** Children whose title still matches the old auto-title follow the rename; hand-edited ones stay. */
  private async cascadeRename(projectId: string, oldName: string, newName: string) {
    const [page, canvas] = await Promise.all([
      this.pagesRepo.findActiveByProject(projectId),
      this.canvasesRepo.findActiveByProject(projectId),
    ]);
    const now = new Date();
    if (page && isAutoTitle(page.title, oldName, "Note")) {
      await this.pagesRepo.updateById(page.id, {
        title: expectedChildTitle(newName, "Note"),
        updatedAt: now,
      });
    }
    if (canvas && isAutoTitle(canvas.title, oldName, "Canvas")) {
      await this.canvasesRepo.updateById(canvas.id, {
        title: expectedChildTitle(newName, "Canvas"),
        updatedAt: now,
      });
    }
  }

  /** Soft archive; the project's note + canvas are soft-deleted with it. */
  async archive(projectId: string, actorUserId: string): Promise<Project> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "project", id: projectId },
      "manage",
    );
    const existing = await this.projectsRepo.findById(projectId);
    if (!existing) throw NotFound("Project not found.");
    const [page, canvas] = await Promise.all([
      this.pagesRepo.findActiveByProject(projectId),
      this.canvasesRepo.findActiveByProject(projectId),
    ]);
    if (page) await this.pagesRepo.softDeleteById(page.id);
    if (canvas) await this.canvasesRepo.softDeleteById(canvas.id);
    const updated = await this.projectsRepo.archiveById(projectId);
    if (!updated) throw NotFound("Project not found.");

    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "project",
      entityId: projectId,
      action: "project.archive",
      before: existing,
      after: { archivedAt: updated.archivedAt, noteId: page?.id, canvasId: canvas?.id },
    });
    return toProject(updated);
  }
}
