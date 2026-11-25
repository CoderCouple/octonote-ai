/**
 * What assistant apps can do in Octonote through the MCP server — the CLI's
 * commands as plain methods. Every call acts as the signed-in person and goes
 * through the normal services, so permissions, plan limits and the audit log
 * apply exactly as in the app. Kept free of MCP types so it can be tested
 * with the integration harness.
 */
import { randomBytes } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { noteDocumentToAnchoredHtml } from "@octonote/content/server";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { WorkspaceMembersRepository } from "../db/repository/workspace-members.repository";
import type { ResourceKind } from "../model/sharing.model";
import { CanvasDiagramService } from "./canvas-diagram.service";
import { CanvasesService } from "./canvases.service";
import { figureApiId } from "@octonote/shared";
import { FiguresService } from "./figures.service";
import { canvasOutline, type CanvasOutline } from "./lib/canvas-outline";
import { resourceUrl } from "./lib/resource-url";
import { NotebooksService } from "./notebooks.service";
import { NoteMarkdownService } from "./note-markdown.service";
import { PagesService } from "./pages.service";
import { ProjectsService } from "./projects.service";
import { SharesService } from "./shares.service";
import { SharingSettingsService } from "./sharing-settings.service";
import { DecksService } from "./decks.service";
import { VideosService } from "./videos.service";

type Compose = typeof import("@octonote/compose");
// An ES module, loaded with Node's require(esm) once TypeScript turns import() into require().
const loadCompose = (): Promise<Compose> => import("@octonote/compose");

export interface Actor {
  id: string;
  email?: string;
  name?: string;
}

export interface ItemRef {
  kind: "note" | "canvas" | "project" | "notebook" | "presentation";
  id: string;
  title: string;
  url: string;
  notebookId?: string | null;
  updatedAt?: string;
}

const KIND_BY_PREFIX: Record<string, ResourceKind> = { pag: "page", cnv: "canvas", prj: "project", ntb: "notebook", dck: "deck" };
const KIND_NAME: Record<ResourceKind, ItemRef["kind"]> = { page: "note", canvas: "canvas", project: "project", notebook: "notebook", deck: "presentation" };
const VIEWS = { notes: "notes", canvas: "canvas", split: "split" } as const;

/** An interactive block in the card: a video, a custom app in its sandbox, or a tile that opens it in Octonote. */
export type PreviewEmbed =
  | { kind: "video"; title: string; url: string | null; posterUrl: string | null; status: string }
  | {
      kind: "custom";
      title: string;
      description: string;
      /** The note block it lives in: the card loads the app with note_embed when the reader presses Run. */
      blockId: string;
      height: number;
    }
  | { kind: "block"; type: string; title: string };

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
  /**
   * Blocks the card draws itself, in note order: the HTML has an empty
   * `<div class="ox-embed" data-e="<index>">` where each goes. Kept out of
   * the HTML so a big custom app doesn't use up the note's size budget.
   */
  embeds?: PreviewEmbed[];
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
const PREVIEW_HTML_MAX = 400_000;
const THEME_TOKEN = "__OX_THEME__";

/** Names people know for each interactive kind, for tiles. */
const BLOCK_NAME: Record<string, string> = {
  quiz: "Quiz",
  mcq: "Practice questions",
  flashcards: "Flashcards",
  mindmap: "Mind map",
  matching: "Matching",
  widget: "Interactive widget",
  infographic: "Infographic",
  scene: "Animation",
};

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
    private readonly figures: FiguresService,
    @Optional() private readonly videos?: VideosService,
    @Optional() private readonly decksService?: DecksService,
  ) {}

  /** Presentations; absent only in tests that don't wire them. */
  private get decks(): DecksService {
    if (!this.decksService) throw BadRequest("Presentations aren't available here.");
    return this.decksService;
  }

  /**
   * A note's HTML for the card, with each interactive block (video, custom
   * app, quiz…) replaced by a placeholder and described in `embeds`. A
   * custom app's code isn't included (one can be 150 KB); see `embed`.
   */
  private async previewHtml(document: unknown): Promise<{ html: string; embeds: PreviewEmbed[] }> {
    const embeds: PreviewEmbed[] = [];
    const place = (embed: PreviewEmbed) => {
      embeds.push(embed);
      return `<div class="ox-embed" data-e="${embeds.length - 1}"></div>`;
    };
    // The card has no sign-in, so its pictures use short-lived links.
    const html = await noteDocumentToAnchoredHtml(await this.figures.withSignedImages(document), {
      replace: async (block, anchor) => {
        const props = (block.props ?? {}) as Record<string, unknown>;
        if (block.type === "manimVideo") {
          const video = this.videos ? await this.videos.get(String(props.videoId ?? "")).catch(() => null) : null;
          return place({
            kind: "video",
            title: video?.title ?? "Video",
            url: video?.status === "done" ? video.url : null,
            posterUrl: video?.posterUrl ?? null,
            status: video?.status ?? "missing",
          });
        }
        if (block.type !== "interactive") return null;
        const type = String(props.kind ?? "widget");
        let spec: Record<string, unknown> = {};
        try {
          spec = JSON.parse(String(props.spec ?? "{}")) as Record<string, unknown>;
        } catch {
          // Unreadable: still a tile, so the reader knows something is there.
        }
        const title = typeof spec.title === "string" && spec.title.trim() ? spec.title.trim() : (BLOCK_NAME[type] ?? "Interactive block");
        if (type === "custom" && typeof spec.html === "string") {
          const height = Number(spec.height);
          return place({
            kind: "custom",
            title,
            description: typeof spec.description === "string" ? spec.description : "",
            blockId: anchor,
            height: Number.isFinite(height) ? Math.min(Math.max(height, 120), 1400) : 360,
          });
        }
        return place({ kind: "block", type: BLOCK_NAME[type] ?? type, title });
      },
    });
    return { html: html.length > PREVIEW_HTML_MAX ? `${html.slice(0, PREVIEW_HTML_MAX)}<p>…</p>` : html, embeds };
  }

  /** A canvas as the card draws it, figures as their stored pictures. */
  private async outline(canvas: { id: string; document: unknown }, userId: string) {
    const stored = await this.figures.signedImagesForCanvas(canvas.id, userId);
    const raw = (canvas.document as { items?: { id?: unknown; type?: unknown }[] } | null)?.items;
    const images = new Map<string, string>();
    for (const it of Array.isArray(raw) ? raw : []) {
      if (it?.type !== "figure" || typeof it.id !== "string") continue;
      const url = stored.get(figureApiId(canvas.id, it.id));
      if (url) images.set(it.id, url);
    }
    return canvasOutline(canvas.document, images);
  }

  /**
   * The workspace to work in: the one asked for when the person is a member
   * (the in-app chat passes the open one), else their own, as the CLI picks it.
   */
  async workspaceId(userId: string, preferred?: string): Promise<string> {
    const rows = await this.members.listForUser(userId);
    if (preferred) {
      if (rows.some((m) => m.workspaceId === preferred)) return preferred;
      throw NotFound("That workspace isn't one of yours.");
    }
    const pick = rows.find((m) => m.role === "OWNER") ?? rows[0];
    if (!pick) throw NotFound("This account has no workspace yet. Open octonote.ai once to create one.");
    return pick.workspaceId;
  }

  async resolveNotebook(userId: string, nameOrId: string, workspaceId?: string): Promise<string> {
    if (nameOrId.startsWith("ntb_")) return nameOrId;
    const all = await this.notebooks.listForWorkspace(await this.workspaceId(userId, workspaceId), userId);
    const exact = all.filter((n) => n.name === nameOrId);
    const loose = exact.length ? exact : all.filter((n) => n.name.toLowerCase() === nameOrId.toLowerCase());
    if (loose.length === 1) return loose[0]!.id;
    if (!loose.length) throw NotFound(`No notebook named "${nameOrId}". list_items with kind "notebook" shows them.`);
    throw BadRequest(`More than one notebook is named "${nameOrId}"; use its id.`);
  }

  // --- Find ------------------------------------------------------------------

  async list(userId: string, opts: { kind?: ItemRef["kind"]; notebook?: string; workspaceId?: string } = {}): Promise<ItemRef[]> {
    if (opts.notebook) {
      const c = await this.notebooks.getContents(await this.resolveNotebook(userId, opts.notebook, opts.workspaceId), userId);
      const items = [
        ...c.notes.map((n) => ref("page", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
        ...c.canvases.map((n) => ref("canvas", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
        ...c.projects.map((p) => ref("project", p.id, p.name, { notebookId: p.notebookId, updatedAt: p.updatedAt.toISOString() })),
        ...c.decks.map((d) => ref("deck", d.id, d.title, { notebookId: d.notebookId, updatedAt: d.updatedAt.toISOString() })),
      ];
      return opts.kind ? items.filter((i) => i.kind === opts.kind) : items;
    }
    const ws = await this.workspaceId(userId, opts.workspaceId);
    const want = (k: ItemRef["kind"]) => !opts.kind || opts.kind === k;
    const [notes, canvases, projects, notebooks, decks] = await Promise.all([
      want("note") ? this.pages.listStandalone(ws, userId) : [],
      want("canvas") ? this.canvases.listStandalone(ws, userId) : [],
      want("project") ? this.projects.listForWorkspace(ws, userId) : [],
      want("notebook") ? this.notebooks.listForWorkspace(ws, userId) : [],
      want("presentation") && this.decksService ? this.decksService.list(ws, userId) : [],
    ]);
    return [
      ...notes.map((n) => ref("page", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
      ...canvases.map((n) => ref("canvas", n.id, n.title, { notebookId: n.notebookId, updatedAt: n.updatedAt.toISOString() })),
      ...projects.map((p) => ref("project", p.id, p.name, { notebookId: p.notebookId, updatedAt: p.updatedAt.toISOString() })),
      ...notebooks.map((n) => ref("notebook", n.id, n.name, { updatedAt: n.updatedAt.toISOString() })),
      ...decks.map((d) => ref("deck", d.id, d.title, { notebookId: d.notebookId, updatedAt: d.updatedAt.toISOString() })),
    ].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  /**
   * Search titles and, for notes, their text, best matches first. A title hit
   * counts most; words found in a note's text count too, so "notes about
   * osmosis" finds a note that mentions it without the word in its title.
   */
  async search(userId: string, query: string, limit = 20, workspaceId?: string): Promise<ItemRef[]> {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = await this.list(userId, { workspaceId });
    if (!words.length) return all.slice(0, limit);
    // Only notes this person can list are read, so access is the same as listing.
    const texts = await this.pages.markdownFor(all.filter((i) => i.kind === "note").map((i) => i.id));
    const scored = all
      .map((item) => {
        const t = item.title.toLowerCase();
        const body = texts.get(item.id)?.toLowerCase() ?? "";
        const hits = words.filter((w) => t.includes(w)).length;
        const inText = words.filter((w) => body.includes(w)).length;
        return { item, score: (hits ? hits * 10 + (t.startsWith(words[0]!) ? 5 : 0) : 0) + inText * 3 };
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
    if (kind === "deck") {
      const { deck } = await this.decks.getOne(id, userId);
      return { ...ref("deck", id, deck.title), text: deckText(deck.title, deck.document) };
    }
    const c = await this.notebooks.getContents(id, userId);
    const lines = [
      ...c.notes.map((n) => `- note ${n.id}: ${n.title}`),
      ...c.canvases.map((n) => `- canvas ${n.id}: ${n.title}`),
      ...c.projects.map((p) => `- project ${p.id}: ${p.name}`),
      ...c.decks.map((d) => `- presentation ${d.id}: ${d.title}`),
    ];
    return {
      ...ref("notebook", id, c.notebook.name),
      text: `Notebook "${c.notebook.name}" holds ${lines.length} item(s):\n${lines.join("\n") || "(empty)"}`,
    };
  }

  /**
   * One custom app in a note, ready for the card's sandbox: the document with
   * its CSP and bridge ("__OX_THEME__" stands for light or dark) and the
   * secret its messages carry.
   */
  async embed(userId: string, noteId: string, blockId: string): Promise<{ title: string; srcdoc: string; nonce: string; height: number }> {
    const { page } = await this.pages.getOne(noteId, userId);
    const blocks = ((page.document as { blocks?: { id?: string; type?: string; props?: Record<string, unknown> }[] } | null)?.blocks ?? []);
    const block = blocks.find((b, i) => (b.id || `i:${i}`) === blockId);
    if (!block || block.type !== "interactive" || block.props?.kind !== "custom") throw NotFound("That app isn't in this note any more.");
    let spec: { title?: unknown; html?: unknown; height?: unknown } = {};
    try {
      spec = JSON.parse(String(block.props.spec ?? "{}"));
    } catch {
      throw NotFound("That app can't be read.");
    }
    if (typeof spec.html !== "string") throw NotFound("That app can't be read.");
    const compose = await loadCompose();
    const nonce = randomBytes(12).toString("base64url");
    const height = Number(spec.height);
    // Hosts' cards block data: media, so the app's own videos play from storage instead.
    let html = spec.html;
    const origins = new Set<string>();
    if (this.videos) {
      for (const v of compose.customVideos(html)) {
        const url = await this.videos.hostEmbedded(v.base64, v.mime).catch(() => null);
        if (!url) continue;
        html = html.split(`data:${v.mime};base64,${v.base64}`).join(url);
        origins.add(new URL(url).origin);
      }
    }
    let srcdoc = compose.customSrcDoc(html, nonce, THEME_TOKEN as "light");
    if (origins.size) srcdoc = srcdoc.replace("media-src data: blob:", `media-src data: blob: ${[...origins].join(" ")}`);
    return {
      title: typeof spec.title === "string" ? spec.title : "App",
      srcdoc,
      nonce,
      height: Number.isFinite(height) ? Math.min(Math.max(height, 120), 1400) : 360,
    };
  }

  /** A note's card HTML and embeds, for the card's refresh after a comment is applied. */
  async noteHtml(userId: string, noteId: string): Promise<{ html: string; embeds: PreviewEmbed[] }> {
    const { page } = await this.pages.getOne(noteId, userId);
    return this.previewHtml(page.document);
  }

  /** Everything the inline card needs for one item, read with the person's own access. */
  async preview(userId: string, id: string): Promise<ItemPreview> {
    const kind = kindOf(id);
    const publicUrl = await this.settings
      .getPublishState(kind, id, userId)
      .then((s) => (s.published ? s.publicUrl : null))
      .catch(() => null);
    const editable = (role: string) => role === "editor" || role === "owner";
    if (kind === "page") {
      const { page, access } = await this.pages.getOne(id, userId);
      return {
        ...ref(kind, id, page.title),
        publicUrl,
        ...(await this.previewHtml(page.document)),
        noteId: page.id,
        version: page.updatedAt.toISOString(),
        canComment: editable(access.role),
      };
    }
    if (kind === "canvas") {
      const { canvas } = await this.canvases.getOne(id, userId);
      return { ...ref(kind, id, canvas.title), publicUrl, thumbnailUrl: canvas.thumbnailUrl, outline: await this.outline(canvas, userId) };
    }
    if (kind === "project") {
      const p = await this.projects.getOne(id, userId);
      const loaded = p.noteId ? await this.pages.getOne(p.noteId, userId) : null;
      const note = loaded?.page ?? null;
      const canvas = p.canvasId ? (await this.canvases.getOne(p.canvasId, userId)).canvas : null;
      return {
        ...ref(kind, id, p.project.name),
        publicUrl,
        ...(note ? await this.previewHtml(note.document) : { html: "", embeds: [] }),
        noteId: note?.id ?? null,
        version: note?.updatedAt.toISOString() ?? null,
        canComment: loaded ? editable(loaded.access.role) : false,
        thumbnailUrl: canvas?.thumbnailUrl ?? null,
        outline: canvas ? await this.outline(canvas, userId) : null,
      };
    }
    if (kind === "deck") {
      // The card shows a presentation as its outline; presenting happens in Octonote.
      const { deck } = await this.decks.getOne(id, userId);
      return { ...ref(kind, id, deck.title), publicUrl, html: deckHtml(deck.document), embeds: [] };
    }
    return { ...ref(kind, id, (await this.notebooks.getContents(id, userId)).notebook.name), publicUrl, items: await this.list(userId, { notebook: id }) };
  }

  // --- Write -----------------------------------------------------------------

  async createNote(userId: string, input: { title: string; markdown?: string; notebook?: string; workspaceId?: string }) {
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook, input.workspaceId) : undefined;
    const page = await this.noteMarkdown.create(
      await this.workspaceId(userId, input.workspaceId),
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

  async createCanvas(userId: string, input: { title: string; mermaid?: string; notebook?: string; workspaceId?: string }) {
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook, input.workspaceId) : undefined;
    const canvas = await this.diagrams.create(
      await this.workspaceId(userId, input.workspaceId),
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

  /**
   * A presentation: from slide markdown (--- between slides, ??? before a
   * slide's notes), or made from a note, project or notebook (the original
   * stays as it is; design "ai" lets a model plan it).
   */
  async createDeck(
    userId: string,
    input: { title?: string; markdown?: string; from?: string; split?: "heading" | "divider"; design?: "rules" | "ai"; notebook?: string; workspaceId?: string },
  ) {
    const ws = await this.workspaceId(userId, input.workspaceId);
    const notebookId = input.notebook ? await this.resolveNotebook(userId, input.notebook, input.workspaceId) : undefined;
    if (input.from) {
      const kind = kindOf(input.from);
      if (kind !== "page" && kind !== "project" && kind !== "notebook") throw BadRequest("A presentation is made from a note, project or notebook.");
      const deck = await this.decks.createFromSource(
        ws,
        {
          source: { kind, id: input.from, split: input.split ?? "heading" },
          textToNotes: true,
          onePerSlide: true,
          design: input.design ?? "rules",
          ...(input.title ? { title: input.title.slice(0, 120) } : {}),
          ...(notebookId ? { notebookId } : {}),
        },
        userId,
      );
      return { ...ref("deck", deck.id, deck.title), slides: slideCount(deck.document) };
    }
    const deck = await this.decks.create(
      ws,
      { title: input.title?.slice(0, 120) || "Untitled presentation", ...(notebookId ? { notebookId } : {}), ...(input.markdown ? { markdown: input.markdown } : {}) },
      userId,
    );
    return { ...ref("deck", deck.id, deck.title), slides: slideCount(deck.document) };
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
    if (kind === "deck") return ref(kind, input.id, (await this.decks.update(input.id, { title: name }, userId)).title);
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
    if (kind === "deck") {
      const d = await this.decks.moveToNotebook(input.id, notebookId, userId);
      return ref(kind, d.id, d.title, { notebookId: d.notebookId });
    }
    const p = await this.projects.moveToNotebook(input.id, notebookId, userId);
    return ref(kind, p.id, p.name, { notebookId: p.notebookId });
  }

  // --- Publish, share, delete (only when the person asked) -------------------

  async setPublished(userId: string, input: { id: string; published: boolean }) {
    if (input.id.startsWith("fig_")) {
      const figure = await this.figures.setPublished(input.id, input.published, userId);
      return { id: input.id, published: Boolean(figure.publishedAt), publicUrl: figure.publishedAt ? figure.url : null };
    }
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
    else if (kind === "deck") await this.decks.softDelete(input.id, userId);
    else await this.notebooks.delete(input.id, userId);
    return {
      id: input.id,
      deleted: true,
      ...(kind === "notebook" ? { note: "The notebook's items moved to the top level; nothing inside was deleted." } : {}),
    };
  }
}

type OutlineSlide = { layout?: string; main?: { type?: string; content?: { text?: string }[] }[]; side?: unknown[]; notes?: string; hidden?: boolean };

const slidesOf = (document: unknown): OutlineSlide[] =>
  Array.isArray((document as { slides?: unknown } | null)?.slides) ? (document as { slides: OutlineSlide[] }).slides : [];

const slideCount = (document: unknown) => slidesOf(document).length;

const slideHeading = (s: OutlineSlide) => {
  const h = (s.main ?? []).find((b) => b.type === "heading");
  return (h?.content ?? []).map((c) => c.text ?? "").join("").trim();
};

/** A presentation as text an assistant can read: each slide's title, layout and notes. */
function deckText(title: string, document: unknown): string {
  const slides = slidesOf(document);
  const lines = slides.map((s, i) => `${i + 1}. ${slideHeading(s) || "(no title)"} [${s.layout ?? "content"}${s.hidden ? ", hidden" : ""}]${s.notes ? `\n   notes: ${s.notes.replace(/\s+/g, " ").slice(0, 300)}` : ""}`);
  return `Presentation "${title}", ${slides.length} slide(s):\n${lines.join("\n") || "(empty)"}\nPresent it from its link in Octonote.`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The card's view of a presentation: its slides as a numbered outline. */
function deckHtml(document: unknown): string {
  const items = slidesOf(document)
    .filter((s) => !s.hidden)
    .map((s) => `<li>${escapeHtml(slideHeading(s) || "Untitled slide")}</li>`)
    .join("");
  return `<ol>${items}</ol>`;
}
