/**
 * Edit requests from the assistant-app card. A reader selects part of a note
 * in ChatGPT or Claude, writes what to change, and the card saves it here
 * (create), then asks the assistant to do it. The assistant reads the request
 * with the selected blocks as markdown (get), then replaces exactly those
 * blocks (apply) or says why it won't (decline). The card polls status and
 * shows the updated note after each change.
 *
 * Anchors are top-level block ids. Older notes may have blocks without ids;
 * the card then sends `i:<index>` anchors, checked against the quoted text,
 * and the blocks get real ids when the first comment is saved.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  markdownToNoteDocument,
  noteDocumentToAnchoredHtml,
  noteDocumentToMarkdown,
} from "@octonote/content/server";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { BadRequest, Conflict, NotFound } from "../common/error/error-factory";
import { PermissionsService } from "../common/permissions.service";
import { Database, DRIZZLE } from "../db/database.module";
import { noteComments } from "../db/schemas/note-comments";
import { PagesService } from "./pages.service";

type Block = Record<string, unknown> & { id?: string; type?: string; content?: unknown; children?: unknown };
type Row = typeof noteComments.$inferSelect;
export type NoteCommentStatus = "pending" | "working" | "done" | "failed" | "declined" | "cancelled";

/** Open = still waiting on the assistant. */
const OPEN: NoteCommentStatus[] = ["pending", "working"];
export const MAX_OPEN_COMMENTS = 20;
export const MAX_BODY = 1000;
export const MAX_QUOTE = 500;
/** The card's note view is cut past this size, like the preview. */
const HTML_MAX = 60_000;

export interface NoteCommentInput {
  /** Top-level block anchors the selection covers (ids, or `i:<index>`). */
  anchors: string[];
  /** The exact text selected (empty when a whole block such as an image was picked). */
  quote?: string;
  /** What to change. */
  body: string;
}

/** What the card shows for one comment. */
export interface NoteCommentDto {
  id: string;
  status: NoteCommentStatus;
  quote: string;
  body: string;
  reason: string | null;
  blockIds: string[];
}

/** What the assistant reads for one comment. */
export interface NoteCommentTask {
  id: string;
  noteId: string;
  request: string;
  quote: string;
  /** The heading of the section the selection sits in, if any. */
  section: string | null;
  /** The selected blocks as markdown: what note_comment_apply replaces. */
  markdown: string;
  before: string;
  after: string;
}

const dto = (r: Row): NoteCommentDto => ({
  id: r.id,
  status: r.status as NoteCommentStatus,
  quote: r.quote,
  body: r.body,
  reason: r.reason,
  blockIds: r.blockIds,
});

function blocksOf(document: unknown): Block[] {
  const blocks = (document as { blocks?: unknown } | null)?.blocks;
  return Array.isArray(blocks) ? (blocks as Block[]) : [];
}

/** A block's plain text, nested content and children included. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    return [textOf(v.content), textOf(v.children), textOf((v as { rows?: unknown }).rows), textOf((v as { cells?: unknown }).cells)]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const hashOf = (blocks: Block[]) => createHash("sha256").update(JSON.stringify(blocks)).digest("hex");

/** First..last index of the given block ids (the selection is one contiguous range). */
function rangeOf(blocks: Block[], ids: string[]): { start: number; end: number } | null {
  const at = ids.map((id) => blocks.findIndex((b) => b.id === id)).filter((i) => i >= 0);
  if (!at.length) return null;
  return { start: Math.min(...at), end: Math.max(...at) };
}

@Injectable()
export class NoteCommentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pages: PagesService,
    private readonly permissions: PermissionsService,
  ) {}

  // ---------- the card ----------

  async create(userId: string, noteId: string, items: NoteCommentInput[]): Promise<NoteCommentDto[]> {
    if (!items.length) throw BadRequest("Nothing to save.");
    const access = await this.permissions.require(userId, { kind: "page", id: noteId }, "edit");
    const { page } = await this.pages.getOne(noteId, userId);
    const open = await this.db
      .select({ id: noteComments.id })
      .from(noteComments)
      .where(and(eq(noteComments.pageId, noteId), inArray(noteComments.status, OPEN)));
    if (open.length + items.length > MAX_OPEN_COMMENTS) {
      throw BadRequest(`A note can have at most ${MAX_OPEN_COMMENTS} comments waiting at a time.`);
    }

    // Older notes: give every block an id before anchoring to them.
    let blocks = blocksOf(page.document);
    if (blocks.some((b) => typeof b.id !== "string" || !b.id)) {
      const withIds = blocks.map((b) => (typeof b.id === "string" && b.id ? b : { ...b, id: randomUUID() }));
      const resolved = items.map((item) => this.resolve(blocks, item));
      await this.pages.update(noteId, { document: { ...(page.document as object), blocks: withIds } }, userId);
      blocks = withIds;
      return this.insert(noteId, access.workspaceId, userId, items, resolved.map((r) => blocks.slice(r.start, r.end + 1).map((b) => b.id!)));
    }
    const resolved = items.map((item) => this.resolve(blocks, item));
    return this.insert(noteId, access.workspaceId, userId, items, resolved.map((r) => blocks.slice(r.start, r.end + 1).map((b) => b.id!)));
  }

  /** Where a comment's anchors point, checked against the quoted text. */
  private resolve(blocks: Block[], item: NoteCommentInput): { start: number; end: number } {
    const body = item.body.trim();
    if (!body) throw BadRequest("Write what you'd like changed.");
    if (body.length > MAX_BODY) throw BadRequest(`Keep a comment under ${MAX_BODY} characters.`);
    if ((item.quote ?? "").length > MAX_QUOTE) throw BadRequest(`Select less than ${MAX_QUOTE} characters.`);
    if (!item.anchors.length || item.anchors.length > 200) throw BadRequest("Select part of the note first.");
    const at = item.anchors.map((a) => {
      const m = /^i:(\d+)$/.exec(a);
      return m ? Number(m[1]) : blocks.findIndex((b) => b.id === a);
    });
    if (at.some((i) => i < 0 || i >= blocks.length)) {
      throw Conflict("The note changed since the card loaded. Reload it and select again.", { code: "NOTE_CHANGED" });
    }
    const start = Math.min(...at);
    const end = Math.max(...at);
    const quote = squash(item.quote ?? "");
    if (quote && !squash(blocks.slice(start, end + 1).map(textOf).join(" ")).includes(quote)) {
      throw Conflict("The note changed since the card loaded. Reload it and select again.", { code: "NOTE_CHANGED" });
    }
    return { start, end };
  }

  private async insert(noteId: string, workspaceId: string, userId: string, items: NoteCommentInput[], ids: string[][]) {
    const rows = await this.db
      .insert(noteComments)
      .values(
        items.map((item, i) => ({
          pageId: noteId,
          workspaceId,
          createdByUserId: userId,
          blockIds: ids[i]!,
          quote: (item.quote ?? "").trim(),
          body: item.body.trim(),
        })),
      )
      .returning();
    return rows.map(dto);
  }

  /**
   * The card's poll: these comments' states (or the note's open ones and the
   * last hour's), and the note's HTML when it changed since `since`.
   */
  async status(
    userId: string,
    noteId: string,
    opts: { ids?: string[]; since?: string | null } = {},
  ): Promise<{ comments: NoteCommentDto[]; version: string; html?: string }> {
    const { page } = await this.pages.getOne(noteId, userId);
    const hourAgo = new Date(Date.now() - 3_600_000);
    const rows = await this.db
      .select()
      .from(noteComments)
      .where(
        and(
          eq(noteComments.pageId, noteId),
          opts.ids?.length
            ? inArray(noteComments.id, opts.ids)
            : or(inArray(noteComments.status, OPEN), gt(noteComments.updatedAt, hourAgo)),
        ),
      )
      .orderBy(asc(noteComments.createdAt));
    const version = page.updatedAt.toISOString();
    const out: { comments: NoteCommentDto[]; version: string; html?: string } = { comments: rows.map(dto), version };
    if (opts.since !== version) out.html = await this.html(page.document);
    return out;
  }

  async html(document: unknown): Promise<string> {
    const html = await noteDocumentToAnchoredHtml(document);
    return html.length > HTML_MAX ? `${html.slice(0, HTML_MAX)}<p>…</p>` : html;
  }

  /** Try a failed or declined comment again (or reopen a cancelled one). */
  async retry(userId: string, id: string): Promise<NoteCommentDto> {
    const row = await this.row(userId, id);
    if (OPEN.includes(row.status as NoteCommentStatus) || row.status === "done") return dto(row);
    return dto(await this.set(id, { status: "pending", reason: null, seenHash: null }));
  }

  async cancel(userId: string, id: string): Promise<NoteCommentDto> {
    const row = await this.row(userId, id);
    if (!OPEN.includes(row.status as NoteCommentStatus)) return dto(row);
    return dto(await this.set(id, { status: "cancelled" }));
  }

  // ---------- the assistant ----------

  /** The open comments (or the given ones) with the text they point at; marks them in progress. */
  async get(userId: string, opts: { ids?: string[]; noteId?: string }): Promise<NoteCommentTask[]> {
    if (!opts.ids?.length && !opts.noteId) throw BadRequest("Give comment ids or a note id.");
    const rows = await this.db
      .select()
      .from(noteComments)
      .where(
        and(
          opts.ids?.length ? inArray(noteComments.id, opts.ids) : eq(noteComments.pageId, opts.noteId!),
          inArray(noteComments.status, OPEN),
        ),
      )
      .orderBy(asc(noteComments.createdAt));
    if (!rows.length) throw NotFound("No open comments there. They may be done or cancelled already.");

    const tasks: NoteCommentTask[] = [];
    const docs = new Map<string, Block[]>();
    for (const row of rows) {
      await this.permissions.require(userId, { kind: "page", id: row.pageId }, "edit");
      if (!docs.has(row.pageId)) docs.set(row.pageId, blocksOf((await this.pages.getOne(row.pageId, userId)).page.document));
      const blocks = docs.get(row.pageId)!;
      const range = rangeOf(blocks, row.blockIds);
      if (!range) {
        await this.set(row.id, { status: "failed", reason: "The text this comment pointed at is no longer in the note." });
        continue;
      }
      const picked = blocks.slice(range.start, range.end + 1);
      const heading = [...blocks.slice(0, range.start)].reverse().find((b) => b.type === "heading");
      const md = (bs: Block[]) => (bs.length ? noteDocumentToMarkdown({ blocks: bs }) : Promise.resolve(""));
      tasks.push({
        id: row.id,
        noteId: row.pageId,
        request: row.body,
        quote: row.quote,
        section: heading ? textOf(heading.content).trim() || null : null,
        markdown: (await md(picked)).trim(),
        before: (await md(blocks.slice(Math.max(0, range.start - 1), range.start))).trim(),
        after: (await md(blocks.slice(range.end + 1, range.end + 2))).trim(),
      });
      await this.set(row.id, { status: "working", seenHash: hashOf(picked), reason: null });
    }
    if (!tasks.length) throw NotFound("Those comments point at text that's no longer in the note.");
    return tasks;
  }

  /**
   * Replace exactly the blocks a comment selected with new markdown (empty
   * markdown removes them). Refused when those blocks changed since get().
   * Other open comments on the replaced blocks move to the new ones.
   */
  async apply(userId: string, id: string, markdown: string): Promise<NoteCommentDto> {
    const row = await this.row(userId, id);
    if (row.status === "done") return dto(row);
    if (row.status !== "working" || !row.seenHash) {
      throw BadRequest("Read the comment with note_comment_get first, then apply it.");
    }
    const { page } = await this.pages.getOne(row.pageId, userId);
    const blocks = blocksOf(page.document);
    const range = rangeOf(blocks, row.blockIds);
    if (!range) {
      return dto(await this.set(id, { status: "failed", reason: "The text this comment pointed at is no longer in the note." }));
    }
    const picked = blocks.slice(range.start, range.end + 1);
    if (hashOf(picked) !== row.seenHash) {
      throw Conflict(`That part of the note changed since you read it. Call note_comment_get for ${id} again and redo the edit.`, {
        code: "NOTE_CHANGED",
      });
    }

    const replacement = markdown.trim()
      ? blocksOf(await markdownToNoteDocument(markdown)).map((b) => (b.id ? b : { ...b, id: randomUUID() }))
      : [];
    const next = [...blocks.slice(0, range.start), ...replacement, ...blocks.slice(range.end + 1)];
    await this.pages.update(
      row.pageId,
      { document: { ...(page.document as object), blocks: next }, contentMd: await noteDocumentToMarkdown({ blocks: next }) },
      userId,
    );
    const done = await this.set(id, { status: "done", doneAt: new Date(), reason: null });
    await this.remap(row.pageId, id, picked.map((b) => b.id!), replacement.map((b) => b.id!));
    return dto(done);
  }

  async decline(userId: string, id: string, reason: string): Promise<NoteCommentDto> {
    const row = await this.row(userId, id);
    if (!OPEN.includes(row.status as NoteCommentStatus)) return dto(row);
    return dto(await this.set(id, { status: "declined", reason: reason.trim().slice(0, 500) || "The assistant didn't make this change." }));
  }

  /** Open comments that pointed at replaced blocks now point at their replacement. */
  private async remap(pageId: string, exceptId: string, oldIds: string[], newIds: string[]) {
    const gone = new Set(oldIds);
    const open = await this.db
      .select()
      .from(noteComments)
      .where(and(eq(noteComments.pageId, pageId), inArray(noteComments.status, OPEN)));
    for (const c of open) {
      if (c.id === exceptId || !c.blockIds.some((b) => gone.has(b))) continue;
      const ids: string[] = [];
      for (const b of c.blockIds) {
        if (!gone.has(b)) ids.push(b);
        else for (const n of newIds) if (!ids.includes(n)) ids.push(n);
      }
      if (!ids.length) {
        await this.set(c.id, { status: "failed", reason: "Another change removed the text this comment pointed at." });
      } else {
        // The text moved: the assistant must read it again before applying.
        await this.set(c.id, { blockIds: ids, seenHash: null, status: "pending" });
      }
    }
  }

  /** The comment, if the caller can edit its note. Others get "not found". */
  private async row(userId: string, id: string): Promise<Row> {
    const [row] = await this.db.select().from(noteComments).where(eq(noteComments.id, id)).limit(1);
    if (!row) throw NotFound("Comment not found.");
    try {
      await this.permissions.require(userId, { kind: "page", id: row.pageId }, "edit");
    } catch {
      throw NotFound("Comment not found.");
    }
    return row;
  }

  private async set(id: string, patch: Partial<typeof noteComments.$inferInsert>): Promise<Row> {
    const [row] = await this.db
      .update(noteComments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(noteComments.id, id))
      .returning();
    return row!;
  }
}
