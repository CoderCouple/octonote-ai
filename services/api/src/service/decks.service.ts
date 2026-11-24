/**
 * Presentations (decks). A deck lives in the workspace, optionally in a
 * notebook, and shares and publishes like any other item. Its document is
 * checked by @octonote/slides on every save: an invalid deck is refused with
 * the reason, a valid one is stored in its repaired, canonical form.
 */
import { Injectable } from "@nestjs/common";
import type { DeckCreate, DeckUpdate } from "../api/v1/request/deck.request";
import { ChangeEventsService } from "../common/change-events.service";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { DecksRepository, type DeckSummaryRow } from "../db/repository/decks.repository";
import { toDeck, type Deck } from "../model/deck.model";
import { NotebookPlacement } from "./lib/notebook-placement";
import { WorkspacesService } from "./workspaces.service";

const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

/** A stored deck's JSON may not exceed this (custom apps and quizzes make big blocks). */
export const DECK_MAX_BYTES = 8 * 1024 * 1024;

type Slides = typeof import("@octonote/slides/core");
// ESM package; the API is CommonJS, so it's loaded on first use (like the AI libraries).
let slides: Promise<Slides> | null = null;
const loadSlides = (): Promise<Slides> => (slides ??= import("@octonote/slides/core"));

@Injectable()
export class DecksService {
  constructor(
    private readonly decksRepo: DecksRepository,
    private readonly permissions: PermissionsService,
    private readonly placement: NotebookPlacement,
    private readonly workspacesService: WorkspacesService,
    private readonly changeEvents: ChangeEventsService,
  ) {}

  async list(workspaceId: string, actorUserId: string): Promise<DeckSummaryRow[]> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    return this.decksRepo.listInWorkspace(workspaceId);
  }

  async getOne(id: string, actorUserId: string | null): Promise<{ deck: Deck; access: ResolvedAccess }> {
    const access = await this.permissions.require(actorUserId, { kind: "deck", id }, "view");
    const row = await this.decksRepo.findActiveById(id);
    if (!row) throw NotFound("Presentation not found.");
    return { deck: toDeck(row), access };
  }

  async create(workspaceId: string, input: DeckCreate, actorUserId: string): Promise<Deck> {
    await this.workspacesService.requireRole(actorUserId, workspaceId, [...MEMBER_ROLES]);
    if (input.notebookId) await this.placement.assertCanPlaceIn(input.notebookId, workspaceId, actorUserId);
    if (input.source) {
      // Recording a source reveals nothing, but only something you can open may be one.
      const access = await this.permissions.require(actorUserId, { kind: input.source.kind, id: input.source.id }, "view");
      if (access.workspaceId !== workspaceId) throw BadRequest("The source belongs to a different workspace.");
    }
    const document = input.document === undefined ? (await loadSlides()).emptyDeck(input.title) : await this.checked(input.document);
    const row = await this.decksRepo.insert({
      workspaceId,
      notebookId: input.notebookId ?? null,
      createdByUserId: actorUserId,
      title: input.title,
      document,
      source: input.source ?? null,
    });
    await this.changeEvents.record({
      workspaceId,
      userId: actorUserId,
      entityType: "deck",
      entityId: row.id,
      action: "deck.create",
      after: { title: row.title, notebookId: row.notebookId, source: row.source },
    });
    return toDeck(row);
  }

  async update(id: string, patch: DeckUpdate, actorUserId: string): Promise<Deck> {
    const access = await this.permissions.require(actorUserId, { kind: "deck", id }, "edit");
    const document = patch.document === undefined ? undefined : await this.checked(patch.document);
    const updated = await this.decksRepo.updateById(id, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(document !== undefined ? { document } : {}),
      updatedAt: new Date(),
    });
    if (!updated) throw NotFound("Presentation not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "deck",
      entityId: id,
      action: "deck.update",
      patch: { fields: Object.keys(patch) },
    });
    return toDeck(updated);
  }

  async moveToNotebook(id: string, notebookId: string | null, actorUserId: string): Promise<Deck> {
    const access = await this.permissions.require(actorUserId, { kind: "deck", id }, "manage");
    const existing = await this.decksRepo.findActiveById(id);
    if (!existing) throw NotFound("Presentation not found.");
    if (notebookId) await this.placement.assertCanPlaceIn(notebookId, access.workspaceId, actorUserId);
    const updated = await this.decksRepo.updateById(id, { notebookId, updatedAt: new Date() });
    if (!updated) throw NotFound("Presentation not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "deck",
      entityId: id,
      action: "deck.move",
      before: { notebookId: existing.notebookId },
      after: { notebookId },
    });
    return toDeck(updated);
  }

  async softDelete(id: string, actorUserId: string): Promise<Deck> {
    const access = await this.permissions.require(actorUserId, { kind: "deck", id }, "manage");
    const updated = await this.decksRepo.softDeleteById(id);
    if (!updated) throw NotFound("Presentation not found.");
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "deck",
      entityId: id,
      action: "deck.delete",
      before: { title: updated.title },
    });
    return toDeck(updated);
  }

  /** Refuses a deck that's too big or malformed (with the reasons); returns its canonical form. */
  private async checked(document: unknown) {
    const size = Buffer.byteLength(JSON.stringify(document ?? null));
    if (size > DECK_MAX_BYTES) throw BadRequest(`The presentation is too large (${Math.round(size / 1024 / 1024)} MB; the limit is 8 MB).`);
    const { deckProblems, toDeckDocument } = await loadSlides();
    const problems = deckProblems(document);
    if (problems.length) throw BadRequest(`The presentation can't be saved: ${problems.slice(0, 5).join(" ")}`);
    return toDeckDocument(document);
  }
}
