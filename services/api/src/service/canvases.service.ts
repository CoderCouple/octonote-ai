/**
 * Canvases. Standalone canvases live in the workspace (optionally in a
 * notebook); a project's canvas is created with the project and can't be
 * deleted or moved on its own.
 */
import { Injectable } from "@nestjs/common";
import type { CanvasCreate, CanvasUpdate } from "../api/v1/request/canvas.request";
import { ChangeEventsService } from "../common/change-events.service";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { CanvasesRepository, type CanvasSummaryRow } from "../db/repository/canvases.repository";
import { toCanvas, type Canvas } from "../model/canvas.model";
import { NotebookPlacement } from "./lib/notebook-placement";
import { WorkspacesService } from "./workspaces.service";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

/**
 * Thumbnails render inside other people's notes (canvas-reference block), so
 * only our own storage bucket is allowed — never an arbitrary third-party URL.
 */
export function isAllowedThumbnailUrl(url: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false;
  return url.startsWith(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/`);
}

@Injectable()
export class CanvasesService {
  constructor(
    private readonly canvasesRepo: CanvasesRepository,
    private readonly permissions: PermissionsService,
    private readonly placement: NotebookPlacement,
    private readonly workspacesService: WorkspacesService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async listStandalone(workspaceId: string, actorUserId: string): Promise<CanvasSummaryRow[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    return this.canvasesRepo.listStandalone(workspaceId);
  }

  /** For the notes `/canvas` picker: every canvas in the workspace, incl. project canvases. */
  async listPickable(workspaceId: string, actorUserId: string): Promise<CanvasSummaryRow[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    return this.canvasesRepo.listAllInWorkspace(workspaceId);
  }

  async getOne(
    canvasId: string,
    actorUserId: string | null,
  ): Promise<{ canvas: Canvas; access: ResolvedAccess }> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "canvas", id: canvasId },
      "view",
    );
    const row = await this.canvasesRepo.findById(canvasId);
    if (!row) throw NotFound("Canvas not found.");
    return { canvas: toCanvas(row), access };
  }

  async create(workspaceId: string, input: CanvasCreate, actorUserId: string): Promise<Canvas> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    if (input.notebookId) {
      await this.placement.assertCanPlaceIn(input.notebookId, workspaceId, actorUserId);
    }
    const row = await this.canvasesRepo.insert({
      workspaceId,
      notebookId: input.notebookId ?? null,
      createdByUserId: actorUserId,
      title: input.title,
      document: {},
    });
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "canvas",
      entityId: row.id,
      action: "canvas.create",
      after: row,
    });
    return toCanvas(row);
  }

  async update(canvasId: string, patch: CanvasUpdate, actorUserId: string): Promise<Canvas> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "canvas", id: canvasId },
      "edit",
    );
    if (
      patch.thumbnailUrl &&
      !isAllowedThumbnailUrl(patch.thumbnailUrl, process.env.SUPABASE_URL)
    ) {
      throw BadRequest("Thumbnail must be uploaded to Octonote storage.");
    }
    const updated = await this.canvasesRepo.updateById(canvasId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.document !== undefined ? { document: patch.document as never } : {}),
      ...(patch.thumbnailUrl !== undefined ? { thumbnailUrl: patch.thumbnailUrl } : {}),
      ...(patch.settings !== undefined ? { settings: patch.settings as never } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Canvas not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "canvas",
      entityId: canvasId,
      action: "canvas.update",
      patch: { fields: Object.keys(patch) },
    });
    return toCanvas(updated);
  }

  async moveToNotebook(
    canvasId: string,
    notebookId: string | null,
    actorUserId: string,
  ): Promise<Canvas> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "canvas", id: canvasId },
      "manage",
    );
    const existing = await this.canvasesRepo.findById(canvasId);
    if (!existing) throw NotFound("Canvas not found.");
    if (existing.projectId) throw BadRequest("A project's canvas moves with its project.");
    if (notebookId) {
      await this.placement.assertCanPlaceIn(notebookId, access.workspaceId, actorUserId);
    }
    const updated = await this.canvasesRepo.updateById(canvasId, {
      notebookId,
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Canvas not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "canvas",
      entityId: canvasId,
      action: "canvas.move",
      before: { notebookId: existing.notebookId },
      after: { notebookId },
    });
    return toCanvas(updated);
  }

  async softDelete(canvasId: string, actorUserId: string): Promise<Canvas> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "canvas", id: canvasId },
      "manage",
    );
    const existing = await this.canvasesRepo.findById(canvasId);
    if (!existing) throw NotFound("Canvas not found.");
    if (existing.projectId) throw BadRequest("Delete the project to remove its canvas.");
    const updated = await this.canvasesRepo.softDeleteById(canvasId);
    if (!updated) throw NotFound("Canvas not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "canvas",
      entityId: canvasId,
      action: "canvas.delete",
      before: { title: existing.title },
    });
    return toCanvas(updated);
  }
}
