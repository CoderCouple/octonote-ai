/**
 * Presentations (decks). A deck lives in the workspace, optionally in a
 * notebook, and shares and publishes like any other item. Its document is
 * checked by @octonote/slides on every save: an invalid deck is refused with
 * the reason, a valid one is stored in its repaired, canonical form.
 */
import { Injectable, Optional } from "@nestjs/common";
import { markdownToNoteDocument } from "@octonote/content/server";
import type { DeckCreate, DeckFromSource, DeckUpdate } from "../api/v1/request/deck.request";
import { ChangeEventsService } from "../common/change-events.service";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { PermissionsService, type ResolvedAccess } from "../common/permissions.service";
import { CanvasesRepository } from "../db/repository/canvases.repository";
import { DecksRepository, type DeckSummaryRow } from "../db/repository/decks.repository";
import { NotebooksRepository } from "../db/repository/notebooks.repository";
import { PagesRepository } from "../db/repository/pages.repository";
import { ProjectsRepository } from "../db/repository/projects.repository";
import { toDeck, type Deck } from "../model/deck.model";
import { ComposeAiService } from "./compose-ai.service";
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
    private readonly pagesRepo: PagesRepository,
    private readonly canvasesRepo: CanvasesRepository,
    private readonly projectsRepo: ProjectsRepository,
    private readonly notebooksRepo: NotebooksRepository,
    /** Checks quizzes, widgets and other blocks written as markdown; absent in some tests. */
    @Optional() private readonly interactive?: ComposeAiService,
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
    if (input.document !== undefined && input.markdown !== undefined) throw BadRequest("Send either document or markdown, not both.");
    const document =
      input.markdown !== undefined
        ? await this.checked(await this.fromMarkdown(input.markdown))
        : input.document === undefined
          ? (await loadSlides()).emptyDeck(input.title)
          : await this.checked(input.document);
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

  /**
   * A deck made from a note, project or notebook on the server (CLI, agents),
   * the same way the app's "Make presentation" does. The source stays as it
   * is; the deck is a copy that remembers it.
   */
  async createFromSource(workspaceId: string, input: DeckFromSource, actorUserId: string): Promise<Deck> {
    const { source } = input;
    const access = await this.permissions.require(actorUserId, { kind: source.kind, id: source.id }, "view");
    if (access.workspaceId !== workspaceId) throw BadRequest("The source belongs to a different workspace.");
    const slides = await loadSlides();
    const options = { split: source.split, textToNotes: input.textToNotes, onePerSlide: input.onePerSlide };
    // "Let AI design it": refuse early (before loading anything) when AI isn't available to this person.
    if (input.design === "ai") {
      if (!this.interactive) throw BadRequest("AI design isn't available here.");
      await this.interactive.assertReady(actorUserId);
    }
    type Item = import("@octonote/slides/core").DesignItem;
    const designItems: Item[] = [];
    const asNote = (n: { title: string; blocks: Record<string, unknown>[] }): Item => ({ kind: "note", title: n.title, blocks: n.blocks });
    const ofProject = (p: Awaited<ReturnType<DecksService["project"]>>): Item[] => [
      ...(p.note ? [asNote({ ...p.note, title: p.title })] : []),
      ...(p.canvas ? [{ kind: "canvas" as const, title: p.canvas.title, canvas: p.canvas }] : []),
    ];
    let title: string;
    let notebookId: string | null;
    let document: unknown;
    if (source.kind === "page") {
      const note = await this.note(source.id);
      title = note.title;
      notebookId = note.notebookId;
      document = slides.deckFromNote(note, options);
      designItems.push(asNote(note));
    } else if (source.kind === "project") {
      const project = await this.project(source.id);
      title = project.title;
      notebookId = project.notebookId;
      document = slides.deckFromProject(project, options);
      designItems.push(...ofProject(project));
    } else {
      const notebook = await this.notebooksRepo.findById(source.id);
      if (!notebook) throw NotFound("Notebook not found.");
      const [notes, canvases, projects] = await Promise.all([
        this.pagesRepo.listByNotebook(source.id),
        this.canvasesRepo.listByNotebook(source.id),
        this.projectsRepo.listByNotebook(source.id),
      ]);
      // In the order the notebook lists them: by name, the way people number things.
      const refs = [
        ...notes.map((n) => ({ kind: "page" as const, id: n.id, title: n.title })),
        ...canvases.map((c) => ({ kind: "canvas" as const, id: c.id, title: c.title })),
        ...projects.map((p) => ({ kind: "project" as const, id: p.id, title: p.name })),
      ].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
      const items = await Promise.all(
        refs.map(async (ref) => {
          if (ref.kind === "page") return { kind: "page" as const, ...(await this.note(ref.id)) };
          if (ref.kind === "canvas") return { kind: "canvas" as const, ...(await this.canvas(ref.id)) };
          return { kind: "project" as const, ...(await this.project(ref.id)) };
        }),
      );
      title = notebook.name;
      notebookId = notebook.id;
      document = slides.deckFromNotebook({ title: notebook.name, items }, options);
      for (const it of items) {
        if (it.kind === "page") designItems.push(asNote(it));
        else if (it.kind === "canvas") designItems.push({ kind: "canvas", title: it.title, canvas: it });
        else designItems.push(...ofProject(it));
      }
    }
    if (input.design === "ai") {
      const brief = slides.designBrief(input.title ?? title, designItems);
      const plan = await this.interactive!.designSlides(actorUserId, brief, slides.DESIGN_SCHEMA as unknown as Record<string, unknown>, slides.DESIGN_SYSTEM);
      document = slides.deckFromDesign(plan, brief);
    }
    return this.create(
      workspaceId,
      {
        title: (input.title ?? title).trim().slice(0, 120) || "Untitled presentation",
        notebookId: input.notebookId ?? notebookId ?? undefined,
        document,
        source,
      },
      actorUserId,
    );
  }

  private async note(id: string) {
    const row = await this.pagesRepo.findById(id);
    if (!row || row.deletedAt) throw NotFound("Note not found.");
    const blocks = (row.document as { blocks?: unknown[] } | null)?.blocks;
    return { title: row.title, blocks: Array.isArray(blocks) ? (blocks as Record<string, unknown>[]) : [], notebookId: row.notebookId };
  }

  private async canvas(id: string) {
    const row = await this.canvasesRepo.findById(id);
    if (!row || row.deletedAt) throw NotFound("Canvas not found.");
    return { title: row.title, canvasId: row.id, slides: (await loadSlides()).canvasSlideRefs(row.document), document: row.document };
  }

  private async project(id: string) {
    const row = await this.projectsRepo.findById(id);
    if (!row || row.archivedAt) throw NotFound("Project not found.");
    const [page, canvas] = await Promise.all([this.pagesRepo.findActiveByProject(id), this.canvasesRepo.findActiveByProject(id)]);
    const note = page ? await this.note(page.id) : null;
    const pictured = canvas ? await this.canvas(canvas.id) : null;
    // An empty canvas adds nothing to the talk.
    const hasCanvas = pictured && pictured.slides.length > 0;
    return { title: row.name, notebookId: row.notebookId, note, canvas: hasCanvas ? { ...pictured, title: row.name } : null };
  }

  /** Slide markdown (--- between slides, ??? before notes) → a deck, its blocks checked like a note's. */
  private async fromMarkdown(markdown: string) {
    const { splitSlideMarkdown, deckFromSlides } = await loadSlides();
    const parts = splitSlideMarkdown(markdown);
    if (!parts.length) throw BadRequest("The markdown has no slides. Separate slides with a line of ---.");
    const slides = await Promise.all(parts.map(async (p) => ({ blocks: p.markdown ? (await markdownToNoteDocument(p.markdown)).blocks : [], notes: p.notes })));
    // A quiz, widget or app that doesn't validate is refused with the reason, as notes written as markdown are.
    await this.interactive?.assertValid({ blocks: slides.flatMap((s) => s.blocks) });
    return deckFromSlides(slides);
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
