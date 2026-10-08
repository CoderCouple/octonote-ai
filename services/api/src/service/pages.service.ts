/**
 * Notes. Standalone notes live in the workspace (optionally in a notebook);
 * a project's note is created with the project and can't be deleted or
 * moved on its own.
 */
import { Injectable } from "@nestjs/common";
import type { PageCreate, PageUpdate } from "../api/v1/request/page.request";
import { ChangeEventsService } from "../common/change-events.service";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { PagesRepository, type PageSummaryRow } from "../db/repository/pages.repository";
import { toPage, type Page } from "../model/page.model";
import { NotebookPlacement } from "./lib/notebook-placement";
import { WorkspacesService } from "./workspaces.service";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

@Injectable()
export class PagesService {
  constructor(
    private readonly pagesRepo: PagesRepository,
    private readonly permissions: PermissionsService,
    private readonly placement: NotebookPlacement,
    private readonly workspacesService: WorkspacesService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async listStandalone(workspaceId: string, actorUserId: string): Promise<PageSummaryRow[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    return this.pagesRepo.listStandalone(workspaceId);
  }

  async getOne(
    pageId: string,
    actorUserId: string | null,
  ): Promise<{ page: Page; access: ResolvedAccess }> {
    const access = await this.permissions.require(actorUserId, { kind: "page", id: pageId }, "view");
    const row = await this.pagesRepo.findById(pageId);
    if (!row) throw NotFound("Page not found.");
    return { page: toPage(row), access };
  }

  async create(workspaceId: string, input: PageCreate, actorUserId: string): Promise<Page> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    if (input.notebookId) {
      await this.placement.assertCanPlaceIn(input.notebookId, workspaceId, actorUserId);
    }
    const row = await this.pagesRepo.insert({
      workspaceId,
      notebookId: input.notebookId ?? null,
      createdByUserId: actorUserId,
      title: input.title,
      document: {},
    });
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "page",
      entityId: row.id,
      action: "page.create",
      after: row,
    });
    return toPage(row);
  }

  async update(pageId: string, patch: PageUpdate, actorUserId: string): Promise<Page> {
    const access = await this.permissions.require(actorUserId, { kind: "page", id: pageId }, "edit");
    const existing = await this.pagesRepo.findById(pageId);
    if (!existing) throw NotFound("Page not found.");

    const updated = await this.pagesRepo.updateById(pageId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.document !== undefined ? { document: patch.document as never } : {}),
      ...(patch.contentMd !== undefined ? { contentMd: patch.contentMd } : {}),
      ...(patch.settings !== undefined ? { settings: patch.settings as never } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Page not found.");

    // Document bodies are large and saved on every debounce; audit the fact, not the content.
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "page",
      entityId: pageId,
      action: "page.update",
      patch: { fields: Object.keys(patch) },
    });
    return toPage(updated);
  }

  async moveToNotebook(
    pageId: string,
    notebookId: string | null,
    actorUserId: string,
  ): Promise<Page> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "page", id: pageId },
      "manage",
    );
    const existing = await this.pagesRepo.findById(pageId);
    if (!existing) throw NotFound("Page not found.");
    if (existing.projectId) throw BadRequest("A project's note moves with its project.");
    if (notebookId) {
      await this.placement.assertCanPlaceIn(notebookId, access.workspaceId, actorUserId);
    }
    const updated = await this.pagesRepo.updateById(pageId, { notebookId, updatedAt: new Date() });
    if (!updated) throw NotFound("Page not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "page",
      entityId: pageId,
      action: "page.move",
      before: { notebookId: existing.notebookId },
      after: { notebookId },
    });
    return toPage(updated);
  }

  async softDelete(pageId: string, actorUserId: string): Promise<Page> {
    const access = await this.permissions.require(
      actorUserId,
      { kind: "page", id: pageId },
      "manage",
    );
    const existing = await this.pagesRepo.findById(pageId);
    if (!existing) throw NotFound("Page not found.");
    if (existing.projectId) throw BadRequest("Delete the project to remove its note.");
    const updated = await this.pagesRepo.softDeleteById(pageId);
    if (!updated) throw NotFound("Page not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "page",
      entityId: pageId,
      action: "page.delete",
      before: { title: existing.title },
    });
    return toPage(updated);
  }
}
