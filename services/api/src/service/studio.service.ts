import {
  STUDIO_KIND_LABEL,
  STUDIO_LIMITS,
  type CreateStudioItemInput,
  type StudioItem,
  type StudioItemSummary,
  type StudioKind,
  type StudioSourceType,
  type StudioStats,
  type StudioStatus,
} from "@octonote/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, count, desc, eq, lt } from "drizzle-orm";
import { AppError } from "../common/error/app-error";
import { BadRequest, NotFound } from "../common/error/error-factory";
import { Database, DRIZZLE } from "../db/database.module";
import { studioItems, type StudioItemRow } from "../db/schemas";
import { ComposeAiService } from "./compose-ai.service";
import { ExtensionItemsService } from "./extension-items.service";
import { McpToolsService } from "./mcp-tools.service";
import { readPdf, readWebPage, SourceError } from "./lib/studio-sources";

/**
 * Studio (user decision 2026-11-13): turn a source (pasted text, a web page,
 * a note or project, or a PDF) into one interactive block made by AI, kept as
 * a studio item. Reading the source happens in the request, so a bad link or
 * PDF is refused straight away; the AI runs in the background and the item
 * moves from running to succeeded or failed. Items are private to the person
 * who made them until published, which makes them readable by link.
 */

/** Items one person can have generating at once. */
const MAX_RUNNING = 3;
/** A run older than this was cut off (e.g. by a deploy) and is shown as failed. */
const STALE_MS = 10 * 60_000;
const WEEK_MS = 7 * 24 * 3_600_000;

@Injectable()
export class StudioService {
  private readonly log = new Logger(StudioService.name);
  /** Runs in progress on this instance, so tests (and shutdown) can wait for them. */
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tools: McpToolsService,
    private readonly ai: ComposeAiService,
    private readonly items: ExtensionItemsService,
  ) {}

  async list(userId: string, workspaceId: string): Promise<{ items: StudioItemSummary[]; stats: StudioStats }> {
    await this.tools.workspaceId(userId, workspaceId);
    await this.expireStale(userId);
    const rows = await this.db
      .select()
      .from(studioItems)
      .where(and(eq(studioItems.userId, userId), eq(studioItems.workspaceId, workspaceId)))
      .orderBy(desc(studioItems.updatedAt));
    const weekAgo = Date.now() - WEEK_MS;
    const stats: StudioStats = { total: rows.length, succeeded: 0, running: 0, failed: 0, thisWeek: 0 };
    for (const r of rows) {
      stats[r.status as StudioStatus] += 1;
      if (r.createdAt.getTime() >= weekAgo) stats.thisWeek += 1;
    }
    return { items: rows.map(summary), stats };
  }

  /** Reads the source now (so problems are reported at once), saves the item as running, and starts the AI. */
  async create(userId: string, input: CreateStudioItemInput): Promise<StudioItem> {
    const workspaceId = await this.tools.workspaceId(userId, input.workspaceId);
    const [{ total } = { total: 0 }] = await this.db.select({ total: count() }).from(studioItems).where(eq(studioItems.userId, userId));
    if (Number(total) >= STUDIO_LIMITS.items) throw BadRequest(`You can keep up to ${STUDIO_LIMITS.items} Studio items. Delete some to make more.`);
    await this.expireStale(userId);
    const [{ running } = { running: 0 }] = await this.db
      .select({ running: count() })
      .from(studioItems)
      .where(and(eq(studioItems.userId, userId), eq(studioItems.status, "running")));
    if (Number(running) >= MAX_RUNNING) throw BadRequest(`${MAX_RUNNING} items are already being made. Try again when one finishes.`);

    await this.ai.assertReady(userId);
    const source = await this.read(userId, input.source);
    await this.ai.useAiCall(userId);

    const label = STUDIO_KIND_LABEL[input.kind];
    const [row] = await this.db
      .insert(studioItems)
      .values({
        workspaceId,
        userId,
        kind: input.kind,
        title: (input.title?.trim() || `${label}: ${source.label}`).slice(0, STUDIO_LIMITS.title),
        status: "running",
        sourceType: input.source.type,
        sourceLabel: source.label.slice(0, 300),
        sourceRef: source.ref,
        sourceText: source.text,
      })
      .returning();
    this.start(row!, { keepTitle: !!input.title?.trim() });
    return item(row!, true);
  }

  async get(userId: string | null, id: string): Promise<StudioItem> {
    const [row] = await this.db.select().from(studioItems).where(eq(studioItems.id, id));
    const mine = !!row && row.userId === userId;
    if (!row || (!mine && !row.publishedAt)) throw NotFound("Studio item not found.");
    if (mine && row.status === "running" && Date.now() - row.updatedAt.getTime() > STALE_MS && !this.pending.has(id)) {
      await this.expireStale(row.userId);
      return this.get(userId, id);
    }
    return item(row, mine);
  }

  async rename(userId: string, id: string, title: string) {
    await this.own(userId, id);
    const [row] = await this.db
      .update(studioItems)
      .set({ title: title.trim().slice(0, STUDIO_LIMITS.title) || "Untitled", updatedAt: new Date() })
      .where(eq(studioItems.id, id))
      .returning();
    return item(row!, true);
  }

  async remove(userId: string, id: string) {
    await this.own(userId, id);
    await this.db.delete(studioItems).where(eq(studioItems.id, id));
  }

  /** Runs the AI again on the same source (after a failure, or for a fresh take). */
  async retry(userId: string, id: string): Promise<StudioItem> {
    const row = await this.own(userId, id);
    if (row.status === "running" && this.pending.has(id)) throw BadRequest("This item is still being made.");
    await this.ai.assertReady(userId);
    await this.ai.useAiCall(userId);
    const [updated] = await this.db
      .update(studioItems)
      .set({ status: "running", error: null, updatedAt: new Date() })
      .where(eq(studioItems.id, id))
      .returning();
    this.start(updated!, { keepTitle: true });
    return item(updated!, true);
  }

  /** Publishing makes the item readable by anyone with its link; unpublishing makes it private again. */
  async setPublished(userId: string, id: string, published: boolean): Promise<StudioItem> {
    const row = await this.own(userId, id);
    if (published && row.status !== "succeeded") throw BadRequest("Only finished items can be shared.");
    const [updated] = await this.db
      .update(studioItems)
      .set({ publishedAt: published ? (row.publishedAt ?? new Date()) : null })
      .where(eq(studioItems.id, id))
      .returning();
    return item(updated!, true);
  }

  /** Adds the item to a note: appended to one the person can edit, or as a new note. */
  async addToNote(userId: string, id: string, input: { noteId?: string; workspaceId?: string }) {
    const row = await this.own(userId, id);
    if (row.status !== "succeeded" || !row.spec) throw BadRequest("Only finished items can be added to a note.");
    const markdown = toMarkdown(row);
    if (input.noteId) return this.tools.updateNote(userId, { id: input.noteId, markdown, mode: "append" });
    return this.tools.createNote(userId, { title: row.title, markdown, workspaceId: input.workspaceId ?? row.workspaceId });
  }

  /** For tests and shutdown: resolves when this item's run (if any) has finished. */
  async settled(id: string) {
    await this.pending.get(id);
  }

  // --- internals -------------------------------------------------------------------

  private async own(userId: string, id: string): Promise<StudioItemRow> {
    const [row] = await this.db.select().from(studioItems).where(and(eq(studioItems.id, id), eq(studioItems.userId, userId)));
    if (!row) throw NotFound("Studio item not found.");
    return row;
  }

  private start(row: StudioItemRow, opts: { keepTitle: boolean }) {
    const run = this.run(row, opts).finally(() => this.pending.delete(row.id));
    this.pending.set(row.id, run);
  }

  private async run(row: StudioItemRow, opts: { keepTitle: boolean }) {
    const started = Date.now();
    try {
      const made = await this.ai.generate(row.userId, { kind: row.kind, title: row.sourceLabel, source: row.sourceText }, { counted: true });
      await this.db
        .update(studioItems)
        .set({
          status: "succeeded",
          spec: made.spec,
          error: null,
          durationMs: Date.now() - started,
          updatedAt: new Date(),
          ...(opts.keepTitle ? {} : { title: made.title.slice(0, STUDIO_LIMITS.title) }),
        })
        .where(eq(studioItems.id, row.id));
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Something went wrong while making this. Try again.";
      if (!(error instanceof AppError)) this.log.error(`Studio run ${row.id} failed`, error as Error);
      await this.db
        .update(studioItems)
        .set({ status: "failed", error: message, durationMs: Date.now() - started, updatedAt: new Date() })
        .where(eq(studioItems.id, row.id))
        .catch(() => undefined);
    }
  }

  /** Runs cut off by a restart never finish; after a while they're marked failed so they can be retried. */
  private async expireStale(userId: string) {
    const cutoff = new Date(Date.now() - STALE_MS);
    const stale = await this.db
      .select({ id: studioItems.id })
      .from(studioItems)
      .where(and(eq(studioItems.userId, userId), eq(studioItems.status, "running"), lt(studioItems.updatedAt, cutoff)));
    for (const { id } of stale) {
      if (this.pending.has(id)) continue;
      await this.db
        .update(studioItems)
        .set({ status: "failed", error: "This was interrupted. Try again.", updatedAt: new Date() })
        .where(and(eq(studioItems.id, id), eq(studioItems.status, "running")));
    }
  }

  /** The source as text the AI can read, with a label and where it came from. */
  private async read(userId: string, source: CreateStudioItemInput["source"]): Promise<{ text: string; label: string; ref: string | null }> {
    let text: string;
    let label: string;
    let ref: string | null = null;
    try {
      switch (source.type) {
        case "text": {
          text = source.text;
          const firstLine = text.split("\n").find((l) => l.trim())?.trim() ?? "Pasted text";
          label = firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
          break;
        }
        case "url": {
          const page = await readWebPage(source.url);
          text = page.title ? `# ${page.title}\n\n${page.text}` : page.text;
          label = page.title;
          ref = page.url;
          break;
        }
        case "item": {
          const found = await this.items.get(userId, source.id);
          text = found.markdown;
          label = found.title || "Untitled";
          ref = found.id;
          break;
        }
        case "pdf": {
          const bytes = Buffer.from(source.data, "base64");
          if (bytes.length > STUDIO_LIMITS.pdfBytes) throw BadRequest(`PDFs can be up to ${STUDIO_LIMITS.pdfBytes / 1024 / 1024} MB.`);
          const pdf = await readPdf(new Uint8Array(bytes));
          text = pdf.text;
          label = source.name.replace(/\.pdf$/i, "") || "PDF";
          break;
        }
      }
    } catch (error) {
      if (error instanceof SourceError) {
        if (error.cause) this.log.warn(`Studio source ${source.type} failed: ${(error.cause as NodeJS.ErrnoException).code ?? ""} ${(error.cause as Error).message}`);
        throw BadRequest(error.message);
      }
      throw error;
    }
    text = text.trim();
    if (text.length < STUDIO_LIMITS.minSourceChars) throw BadRequest("There isn't enough text in that source to work from.");
    if (text.length > STUDIO_LIMITS.sourceChars) {
      const cut = text.lastIndexOf("\n", STUDIO_LIMITS.sourceChars);
      text = text.slice(0, cut > STUDIO_LIMITS.sourceChars * 0.8 ? cut : STUDIO_LIMITS.sourceChars).trimEnd();
    }
    return { text, label: label.trim() || "Untitled", ref };
  }
}

function summary(row: StudioItemRow): StudioItemSummary {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as StudioKind,
    status: row.status as StudioStatus,
    sourceType: row.sourceType as StudioSourceType,
    sourceLabel: row.sourceLabel,
    published: !!row.publishedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The full item. Someone opening a shared item sees what was made, not the source text. */
function item(row: StudioItemRow, mine: boolean): StudioItem {
  return {
    ...summary(row),
    workspaceId: mine ? row.workspaceId : "",
    spec: row.spec ?? null,
    error: row.error,
    sourceRef: mine || row.sourceType === "url" ? row.sourceRef : null,
    sourceText: mine ? row.sourceText : "",
    sourceChars: row.sourceText.length,
    durationMs: row.durationMs,
    mine,
  };
}

/** The item as note markdown: a summary is plain markdown; anything else is a fence holding its JSON. */
export function toMarkdown(row: Pick<StudioItemRow, "kind" | "spec">): string {
  const spec = row.spec ?? {};
  if (row.kind === "text") return String(spec.markdown ?? "");
  return `\`\`\`${row.kind}\n${JSON.stringify(spec, null, 2)}\n\`\`\``;
}
