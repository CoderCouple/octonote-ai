/**
 * What assistant apps can do in Octonote through the MCP server — the CLI's
 * commands as plain methods. Every call acts as the signed-in person and goes
 * through the normal services, so permissions, plan limits and the audit log
 * apply exactly as in the app. Kept free of MCP types so it can be tested
 * with the integration harness.
 */
import { Injectable } from "@nestjs/common";
import { noteDocumentToAnchoredHtml } from "@octonote/content/server";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import type { ResourceKind } from "../model/sharing.model";
import { CanvasDiagramService } from "./canvas-diagram.service";
import { CanvasesService } from "./canvases.service";
import { canvasOutline, type CanvasOutline } from "./lib/canvas-outline";
import { resourceUrl } from "./lib/resource-url";
import { NotebooksService } from "./notebooks.service";
import { NoteMarkdownService } from "./note-markdown.service";
import { PagesService } from "./pages.service";
import { ProjectsService } from "./projects.service";
import { SharesService } from "./shares.service";
import { SharingSettingsService } from "./sharing-settings.service";

export interface Actor {
  id: string;
  email?: string;
  name?: string;
}

export interface ItemRef {
  kind: "note" | "canvas" | "project" | "notebook";
  id: string;
  title: string;
  url: string;
  notebookId?: string | null;
  updatedAt?: string;
}

const KIND_BY_PREFIX: Record<string, ResourceKind> = { pag: "page", cnv: "canvas", prj: "project", ntb: "notebook" };
const KIND_NAME: Record<ResourceKind, ItemRef["kind"]> = { page: "note", canvas: "canvas", project: "project", notebook: "notebook" };
const VIEWS = { notes: "notes", canvas: "canvas", split: "split" } as const;

/** What the inline card (MCP Apps view) shows for an item. Never sent to the model. */
export interface ItemPreview {
  kind: ItemRef["kind"];
  id: string;
  title: string;
  url: string;
  publicUrl: string | null;
  /**
   * A note's content (or a project's note) as HTML, each top-level block
   * wrapped in `<div data-b="…">` so the card can anchor comments.
   */
  html?: string;
  /** The note comments go to (a project's own note for projects). */
  noteId?: string | null;
  /** The note's updatedAt: the card's comment poll sends it back to get fresh HTML only on change. */
  version?: string | null;
  /** Whether this person may edit the note, so the card offers comments. */
  canComment?: boolean;
  /** A canvas's (or a project's canvas's) PNG snapshot. */
  thumbnailUrl?: string | null;
  /** The canvas drawn as vectors, so the card can show it without a snapshot. */
  outline?: CanvasOutline | null;
  /** A notebook's contents. */
  items?: ItemRef[];
}

/** Notes past this size are cut in the card; the link opens the whole note. */
const PREVIEW_HTML_MAX = 60_000;

export function kindOf(id: string): ResourceKind {
  const kind = KIND_BY_PREFIX[id.slice(0, 3)];
  if (!kind || id[3] !== "_") {
    throw BadRequest(`"${id}" isn't an Octonote id. Ids look like pag_… (note), cnv_… (canvas), prj_… (project) or ntb_… (notebook).`);
  }
  return kind;
}

const ref = (kind: ResourceKind, id: string, title: string, extra: Partial<ItemRef> = {}): ItemRef => ({
  kind: KIND_NAME[kind],
  id,
  title,
  url: resourceUrl(kind, id),
  ...extra,
});

@Injectable()
export class McpToolsService {
  constructor(
    private readonly members: WorkspaceMembersRepository,
    private readonly pages: PagesService,
    private readonly canvases: CanvasesService,
    private readonly projects: ProjectsService,
    private readonly notebooks: NotebooksService,
    private readonly noteMarkdown: NoteMarkdownService,
    private readonly diagrams: CanvasDiagramService,
    private readonly settings: SharingSettingsService,
    private readonly shares: SharesService,
  ) {}

  /** The person's own workspace (the one they own), as the CLI picks it. */
  async workspaceId(userId: string): Promise<string> {
    const rows = await this.members.listForUser(userId);
    const pick = rows.find((m) => m.role === "OWNER") ?? rows[0];
    if (!pick) throw NotFound("This account has no workspace yet. Open octonote.ai once to create one.");
    return pick.workspaceId;
  }

  async resolveNotebook(userId: string, nameOrId: string): Promise<string> {
    if (nameOrId.startsWith("ntb_")) return nameOrId;
    const all = await this.notebooks.listForWorkspace(await this.workspaceId(userId), userId);
    const exact = all.filter((n) => n.name === nameOrId);
    const loose = exact.length ? exact : all.filter((n) => n.name.toLowerCase() === nameOrId.toLowerCase());
    if (loose.length === 1) return loose[0]!.id;
    if (!loose.length) throw NotFound(`No notebook named "${nameOrId}". list_items with kind "notebook" shows them.`);
    throw BadRequest(`More than one notebook is named "${nameOrId}"; use its id.`);
  }

  // --- Find ------------------------------------------------------------------

  async list(userId: string, opts: { kind?: ItemRef["kind"]; notebook?: string } = {}): Promise<ItemRef[]> {
    if (opts.notebook) {
      const c = await this.notebooks.getContents(await this.resolveNotebook(userId, opts.notebook), userId);
      const items = [
        ...c.notes.map((n) => ref("page", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
        ...c.canvases.map((n) => ref("canvas", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
        ...c.projects.map((p) => ref("project", p.id, p.name, { notebookId: p.notebookId, updatedAt: p.updatedAt.toISOString() })),
      ];
      return opts.kind ? items.filter((i) => i.kind === opts.kind) : items;
    }
    const ws = await this.workspaceId(userId);
    const want = (k: ItemRef["kind"]) => !opts.kind || opts.kind === k;
    const [notes, canvases, projects, notebooks] = await Promise.all([
      want("note") ? this.pages.listStandalone(ws, userId) : [],
      want("canvas") ? this.canvases.listStandalone(ws, userId) : [],
      want("project") ? this.projects.listForWorkspace(ws, userId) : [],
      want("notebook") ? this.notebooks.listForWorkspace(ws, userId) : [],
    ]);
    return [
      ...notes.map((n) => ref("page", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
      ...canvases.map((n) => ref("canvas", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
      ...projects.map((p) => ref("project", p.id, p.name, { notebookId: p.notebookId, updatedAt: p.updatedAt.toISOString() })),
      ...notebooks.map((n) => ref("notebook", n.id, n.name, { updatedAt: n.updatedAt.toISOString() })),
    ].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  /** Title search (full-text search is a later feature), best matches first. */
  async search(userId: string, query: string, limit = 20): Promise<ItemRef[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = await this.list(userId);
    if (!words.length) return all.slice(0, limit);
    const scored = all
      .map((item) => {
        const t = item.title.toLowerCase();
        const hits = words.filter((w) => t.includes(w)).length;
        return { item, score: hits ? hits * 10 + (t.startsWith(words[0]!) ? 5 : 0) : 0 };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.item);
  }

  /** One item as text an assistant can read: a note's markdown, a project's note, a notebook's contents. */
  async fetch(userId: string, id: string): Promise<ItemRef & { text: string }> {
    const kind = kindOf(id);
    if (kind === "page") {
      const n = await this.noteMarkdown.read(id, userId);
      return { ...ref("page", id, n.title), text: n.markdown };
    }
    if (kind === "canvas") {
      const { canvas } = await this.canvases.getOne(id, userId);
      return {
        ...ref("canvas", id, canvas.title),
        text: `Canvas "${canvas.title}": a drawing of shapes and arrows, viewable at its link. Canvases can be redrawn from a mermaid flowchart or class diagram.`,
      };
    }
    if (kind === "project") {
      const p = await this.projects.getOne(id, userId);
      const note = p.noteId ? await this.noteMarkdown.read(p.noteId, userId) : null;
      return {
        ...ref("project", id, p.project.name),
        text: [
          `Project "${p.project.name}": note ${p.noteId ?? "—"} and canvas ${p.canvasId ?? "—"}, side by side.`,
          note ? `\n## Note\n\n${note.markdown}` : "",
        ].join("\n"),
      };
    }
    const c = await this.notebooks.getContents(id, userId);
    const lines = [
      ...c.notes.map((n) => `- note ${n.id}: ${n.title}`),
      ...c.canvases.map((n) => `- canvas ${n.id}: ${n.title}`),
      ...c.projects.map((p) => `- project ${p.id}: ${p.name}`),
    ];
    return {
      ...ref("notebook", id, c.notebook.name),
      text: `Notebook "${c.notebook.name}" holds ${lines.length} item(s):\n${lines.join("\n") || "(empty)"}`,
    };
  }

  /** Everything the inline card needs for one item, read with the person's own access. */
  async preview(userId: string, id: string): Promise<ItemPreview> {
    const kind = kindOf(id);
    const publicUrl = await this.settings
      .getPublishState(kind, id, userId)
      .then((s) => (s.published ? s.publicUrl : null))
      .catch(() => null);
    const html = async (document: unknown) => {
      const out = await noteDocumentToAnchoredHtml(document);
      return out.length > PREVIEW_HTML_MAX ? `${out.slice(0, PREVIEW_HTML_MAX)}<p>…</p>` : out;
    };
    const editable = (role: string) => role === "editor" || role === "owner";
    if (kind === "page") {
      const { page, access } = await this.pages.getOne(id, userId);
      return {
        ...ref(kind, id, page.title),
        publicUrl,
        html: await html(page.document),
        noteId: page.id,
        version: page.updatedAt.toISOString(),
        canComment: editable(access.role),
      };
    }
    if (kind === "canvas") {
      const { canvas } = await this.canvases.getOne(id, userId);
      return { ...ref(kind, id, canvas.title), publicUrl, thumbnailUrl: canvas.thumbnailUrl, outline: canvasOutline(canvas.document) };
    }
    if (kind === "project") {
      const p = await this.projects.getOne(id, userId);
      const loaded = p.noteId ? await this.pages.getOne(p.noteId, userId) : null;
      const note = loaded?.page ?? null;
      const canvas = p.canvasId ? (await this.canvases.getOne(p.canvasId, userId)).canvas : null;
      return {
        ...ref(kind, id, p.project.name),
        publicUrl,
        html: note ? await html(note.document) : "",
        noteId: note?.id ?? null,
        version: note?.updatedAt.toISOString() ?? null,
        canComment: loaded ? editable(loaded.access.role) : false,
        thumbnailUrl: canvas?.thumbnailUrl ?? null,
        outline: canvas ? canvasOutline(canvas.document) : null,
      };
    }
    return { ...ref(kind, id, (await this.notebooks.getContents(id, userId)).notebook.name), publicUrl, items: await this.list(userId, { notebook: id }) };
  }

  // --- Write -----------------------------------------------------------------

  async createNote(userId: string, input: { title: string; markdown?: string; notebook?: string }) {
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook) : undefined;
    const page = await this.noteMarkdown.create(
      await this.workspaceId(userId),
      { title: input.title.slice(0, 120) || "Untitled", ...(notebookId ? { notebookId } : {}), ...(input.markdown ? { markdown: input.markdown } : {}) },
      userId,
    );
    return ref("page", page.id, page.title);
  }

  async updateNote(userId: string, input: { id: string; markdown: string; mode?: "replace" | "append"; title?: string }) {
    if (kindOf(input.id) !== "page") throw BadRequest(`${input.id} isn't a note.`);
    const page =
      input.mode === "append"
        ? await this.noteMarkdown.append(input.id, input.markdown, userId)
        : await this.noteMarkdown.replace(input.id, input.markdown, input.title?.slice(0, 120), userId);
    return ref("page", page.id, page.title);
  }

  async createCanvas(userId: string, input: { title: string; mermaid?: string; notebook?: string }) {
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook) : undefined;
    const canvas = await this.diagrams.create(
      await this.workspaceId(userId),
      { title: input.title.slice(0, 120) || "Untitled canvas", ...(notebookId ? { notebookId } : {}), ...(input.mermaid ? { mermaid: input.mermaid } : {}) },
      userId,
    );
    return ref("canvas", canvas.id, canvas.title);
  }

  async redrawCanvas(userId: string, input: { id: string; mermaid: string; title?: string }) {
    if (kindOf(input.id) !== "canvas") throw BadRequest(`${input.id} isn't a canvas.`);
    const canvas = await this.diagrams.replace(input.id, input.mermaid, input.title?.slice(0, 120), userId);
    return ref("canvas", canvas.id, canvas.title);
  }

  /** A project with its note and canvas filled in — removed again if filling fails. */
  async createProject(
    userId: string,
    input: { title: string; noteMarkdown?: string; canvasMermaid?: string; view?: keyof typeof VIEWS; notebook?: string },
  ) {
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook) : undefined;
    const { project, noteId, canvasId } = await this.projects.create(
      await this.workspaceId(userId),
      { name: input.title.slice(0, 120) || "Untitled project", ...(notebookId ? { notebookId } : {}) },
      userId,
    );
    try {
      await this.projects.update(project.id, { settings: { defaultView: VIEWS[input.view ?? "split"] } }, userId);
      if (input.noteMarkdown?.trim() && noteId) await this.noteMarkdown.replace(noteId, input.noteMarkdown, undefined, userId);
      if (input.canvasMermaid?.trim() && canvasId) await this.diagrams.replace(canvasId, input.canvasMermaid, undefined, userId);
    } catch (err) {
      await this.projects.archive(project.id, userId).catch(() => {});
      throw err;
    }
    return { ...ref("project", project.id, project.name), noteId, canvasId };
  }

  async createNotebook(userId: string, input: { name: string }) {
    const nb = await this.notebooks.create(await this.workspaceId(userId), { name: input.name.slice(0, 120) }, userId);
    return ref("notebook", nb.id, nb.name);
  }

  async rename(userId: string, input: { id: string; name: string }) {
    const kind = kindOf(input.id);
    const name = input.name.slice(0, 120);
    if (kind === "page") return ref(kind, input.id, (await this.pages.update(input.id, { title: name }, userId)).title);
    if (kind === "canvas") return ref(kind, input.id, (await this.canvases.update(input.id, { title: name }, userId)).title);
    if (kind === "project") return ref(kind, input.id, (await this.projects.update(input.id, { name }, userId)).name);
    return ref(kind, input.id, (await this.notebooks.update(input.id, { name }, userId)).name);
  }

  async move(userId: string, input: { id: string; notebook: string | null }) {
    const kind = kindOf(input.id);
    if (kind === "notebook") throw BadRequest("Notebooks can't go inside notebooks.");
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook) : null;
    if (kind === "page") {
      const p = await this.pages.moveToNotebook(input.id, notebookId, userId);
      return ref(kind, p.id, p.title, { notebookId: p.notebookId });
    }
    if (kind === "canvas") {
      const c = await this.canvases.moveToNotebook(input.id, notebookId, userId);
      return ref(kind, c.id, c.title, { notebookId: c.notebookId });
    }
    const p = await this.projects.moveToNotebook(input.id, notebookId, userId);
    return ref(kind, p.id, p.name, { notebookId: p.notebookId });
  }

  // --- Publish, share, delete (only when the person asked) -------------------

  async setPublished(userId: string, input: { id: string; published: boolean }) {
    const state = await this.settings.setPublished(kindOf(input.id), input.id, input.published, userId);
    return { id: input.id, published: state.published, publicUrl: state.published ? state.publicUrl : null };
  }

  async share(actor: Actor, input: { id: string; email: string; role: "viewer" | "editor" }) {
    const r = await this.shares.add({ resourceKind: kindOf(input.id), resourceId: input.id, email: input.email, role: input.role }, actor);
    return { id: input.id, email: input.email.toLowerCase(), role: input.role, invited: r.user === null, emailSent: r.emailSent };
  }

  async setLinkAccess(userId: string, input: { id: string; access: "off" | "view" | "edit" }) {
    const kind = kindOf(input.id);
    await this.settings.setGeneralAccess(
      kind,
      input.id,
      input.access === "off"
        ? { linkAccess: "restricted", linkRole: "viewer" }
        : { linkAccess: "anyone_with_link", linkRole: input.access === "edit" ? "editor" : "viewer" },
      userId,
    );
    return { id: input.id, linkAccess: input.access, url: resourceUrl(kind, input.id) };
  }

  async remove(userId: string, input: { id: string }) {
    const kind = kindOf(input.id);
    if (kind === "page") await this.pages.softDelete(input.id, userId);
    else if (kind === "canvas") await this.canvases.softDelete(input.id, userId);
    else if (kind === "project") await this.projects.archive(input.id, userId);
    else await this.notebooks.delete(input.id, userId);
    return {
      id: input.id,
      deleted: true,
      ...(kind === "notebook" ? { note: "The notebook's items moved to the top level; nothing inside was deleted." } : {}),
    };
  }
}
