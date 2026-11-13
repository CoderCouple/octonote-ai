/**
 * What the browser extension (Octonote Clipper) reads when the person allowed
 * it to ("clipper_read" tokens; web sessions and full CLI tokens too): a list
 * of their notes, canvases and projects to pick from, and one picked item as
 * Markdown (a canvas as a Mermaid flowchart) or its canvas picture, to insert
 * into a chat. Every read goes through the normal services, so it sees exactly
 * what the person can see in the app; anything else is a 404.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { AppError } from "../common/error/app-error";
import { ErrorCode } from "../common/error/error-codes";
import { NotFound } from "../common/error/error-factory";
import { THUMBNAIL_BUCKET } from "./account.service";
import { CanvasesService } from "./canvases.service";
import { canvasToMermaid } from "./lib/canvas-mermaid";
import { resourceUrl } from "./lib/resource-url";
import { kindOf, McpToolsService, type ItemRef } from "./mcp-tools.service";
import { NotebooksService } from "./notebooks.service";
import { NoteMarkdownService } from "./note-markdown.service";
import { ProjectsService } from "./projects.service";

export type ExtensionItemKind = "note" | "canvas" | "project";

export interface ExtensionItemSummary {
  id: string;
  kind: ExtensionItemKind;
  title: string;
  updatedAt: string | null;
  /** The notebook's name, or null when the item isn't in one. */
  notebook: string | null;
}

export interface ExtensionItem {
  id: string;
  kind: ExtensionItemKind;
  title: string;
  url: string;
  markdown: string;
  chars: number;
  hasImage: boolean;
}

export const ITEMS_DEFAULT_LIMIT = 20;
export const ITEMS_MAX_LIMIT = 50;
/** Longest Markdown an item comes back with; past it the text is cut, with a note. */
export const ITEM_MAX_CHARS = 500_000;
export const TRUNCATED_NOTE =
  "\n\n_[Cut here: this item is longer than 500,000 characters. Open it in Octonote for the rest.]_";
/** Largest canvas picture we pass on (the app stores PNGs up to ~2 MB). */
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 10_000;

/** Reads per person: listing (typing a search) and opening an item or its picture. */
const LIST_PER_MINUTE = 120;
const FETCH_PER_MINUTE = 60;

const NO_ITEM = "That item doesn't exist or isn't yours.";
const NO_IMAGE = "This item has no picture yet. Open it in Octonote once to make one.";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Calls per key within a sliding window, in memory (per API instance), like the token exchange limit. */
export class SlidingWindowLimiter {
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly message: string,
  ) {}

  hit(key: string) {
    const now = Date.now();
    const calls = (this.recent.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (calls.length >= this.max) {
      throw new AppError(ErrorCode.RATE_LIMITED, this.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    calls.push(now);
    this.recent.set(key, calls);
    if (this.recent.size > 10_000) {
      for (const [k, times] of this.recent) {
        if (!times.some((t) => now - t < this.windowMs)) this.recent.delete(k);
      }
    }
  }
}

/**
 * The URL to fetch a canvas picture from, or null unless it is a public
 * object in the thumbnail bucket of our own Supabase project: same origin as
 * SUPABASE_URL, under /storage/v1/object/public/<bucket>/, no credentials.
 * Query and fragment are dropped. Nothing else is ever fetched.
 */
export function thumbnailFetchUrl(stored: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  let base: URL;
  let url: URL;
  try {
    base = new URL(supabaseUrl);
    url = new URL(stored);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin !== base.origin || url.username || url.password) return null;
  const prefix = `/storage/v1/object/public/${THUMBNAIL_BUCKET}/`;
  if (!url.pathname.startsWith(prefix) || url.pathname.length === prefix.length) return null;
  // The URL parser already resolves dot segments; refuse encoded ones and slashes too.
  if (/%2e|%2f|%5c|\\/i.test(url.pathname)) return null;
  return `${url.origin}${url.pathname}`;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

@Injectable()
export class ExtensionItemsService {
  private readonly listLimit = new SlidingWindowLimiter(LIST_PER_MINUTE, 60_000, "Too many searches. Wait a minute and try again.");
  private readonly fetchLimit = new SlidingWindowLimiter(FETCH_PER_MINUTE, 60_000, "Too many items opened. Wait a minute and try again.");
  /** How pictures are downloaded; tests swap it. */
  fetcher: Fetcher = (url, init) => fetch(url, init);

  constructor(
    private readonly tools: McpToolsService,
    private readonly notebooks: NotebooksService,
    private readonly noteMarkdown: NoteMarkdownService,
    private readonly canvases: CanvasesService,
    private readonly projects: ProjectsService,
  ) {}

  /** The person's notes, canvases and projects in a workspace: newest first, or best matches for `q`. */
  async list(
    userId: string,
    input: { workspaceId: string; q?: string; limit?: number },
  ): Promise<ExtensionItemSummary[]> {
    this.listLimit.hit(userId);
    const limit = Math.min(Math.max(Math.floor(input.limit ?? ITEMS_DEFAULT_LIMIT), 1), ITEMS_MAX_LIMIT);
    const ws = await this.tools.workspaceId(userId, input.workspaceId);
    const q = input.q?.trim() ?? "";
    const found = q ? await this.tools.search(userId, q, 10_000, ws) : await this.tools.list(userId, { workspaceId: ws });
    const items = found
      .filter((i): i is ItemRef & { kind: ExtensionItemKind } => i.kind !== "notebook")
      .slice(0, limit);
    const names = items.some((i) => i.notebookId)
      ? new Map((await this.notebooks.listForWorkspace(ws, userId)).map((n) => [n.id, n.name] as const))
      : new Map<string, string>();
    return items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      updatedAt: i.updatedAt ?? null,
      notebook: (i.notebookId && names.get(i.notebookId)) || null,
    }));
  }

  /** One item as Markdown: a note's text, a canvas as Mermaid, a project's note then its canvas. */
  async get(userId: string, id: string): Promise<ExtensionItem> {
    this.fetchLimit.hit(userId);
    const kind = this.kind(id);
    let title: string;
    let markdown: string;
    let thumbnailUrl: string | null = null;
    if (kind === "page") {
      const note = await this.noteMarkdown.read(id, userId);
      title = note.title;
      markdown = note.markdown;
    } else if (kind === "canvas") {
      const { canvas } = await this.canvases.getOne(id, userId);
      title = canvas.title;
      markdown = mermaidFence(canvasToMermaid(canvas.document));
      thumbnailUrl = canvas.thumbnailUrl;
    } else {
      const p = await this.projects.getOne(id, userId);
      title = p.project.name;
      const note = p.noteId ? (await this.noteMarkdown.read(p.noteId, userId)).markdown.trim() : "";
      const canvas = p.canvasId ? (await this.canvases.getOne(p.canvasId, userId)).canvas : null;
      const diagram = canvas ? mermaidFence(canvasToMermaid(canvas.document)) : "";
      markdown = [note, diagram ? `## Canvas\n\n${diagram}` : ""].filter(Boolean).join("\n\n");
      thumbnailUrl = canvas?.thumbnailUrl ?? null;
    }
    if (markdown.length > ITEM_MAX_CHARS) {
      markdown = markdown.slice(0, ITEM_MAX_CHARS - TRUNCATED_NOTE.length) + TRUNCATED_NOTE;
    }
    return {
      id,
      kind: kind === "page" ? "note" : kind,
      title,
      url: resourceUrl(kind, id),
      markdown,
      chars: markdown.length,
      hasImage: !!thumbnailUrl,
    };
  }

  /** The canvas picture (PNG) of a canvas or a project, fetched only from our own thumbnail bucket. */
  async image(userId: string, id: string): Promise<Buffer> {
    this.fetchLimit.hit(userId);
    const kind = this.kind(id);
    if (kind === "page") throw NotFound(NO_IMAGE);
    let stored: string | null;
    if (kind === "canvas") {
      stored = (await this.canvases.getOne(id, userId)).canvas.thumbnailUrl;
    } else {
      const p = await this.projects.getOne(id, userId);
      stored = p.canvasId ? (await this.canvases.getOne(p.canvasId, userId)).canvas.thumbnailUrl : null;
    }
    const url = stored ? thumbnailFetchUrl(stored, process.env.SUPABASE_URL) : null;
    if (!url) throw NotFound(NO_IMAGE);
    return this.download(url);
  }

  private kind(id: string): "page" | "canvas" | "project" {
    let kind: string;
    try {
      kind = kindOf(id);
    } catch {
      throw NotFound(NO_ITEM);
    }
    if (kind !== "page" && kind !== "canvas" && kind !== "project") throw NotFound(NO_ITEM);
    return kind;
  }

  private async download(url: string): Promise<Buffer> {
    const unavailable = () =>
      new AppError(ErrorCode.SERVER_ERROR, "The picture couldn't be loaded. Try again.", HttpStatus.BAD_GATEWAY);
    let res: Response;
    try {
      res = await this.fetcher(url, { redirect: "error", signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    } catch {
      throw unavailable();
    }
    if (res.status === 404 || res.status === 400) throw NotFound(NO_IMAGE);
    if (!res.ok || !res.body) throw unavailable();
    if (Number(res.headers.get("content-length") ?? 0) > IMAGE_MAX_BYTES) throw unavailable();

    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > IMAGE_MAX_BYTES) {
          await reader.cancel().catch(() => {});
          throw unavailable();
        }
        chunks.push(Buffer.from(value));
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw unavailable();
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw unavailable();
    return bytes;
  }
}

function mermaidFence(mermaid: string | null): string {
  return mermaid ? `\`\`\`mermaid\n${mermaid}\n\`\`\`` : "";
}
