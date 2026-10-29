/**
 * Notes as markdown — the way the CLI and agents read and write them.
 * Conversion lives in @octonote/content (shared with the editor's paste
 * importer); this service only adds permissions and storage, by going
 * through PagesService so every rule (edit access, audit) still applies.
 */
import { Injectable } from "@nestjs/common";
import { markdownToNoteDocument, noteDocumentToMarkdown } from "@octonote/content/server";
import { NotFound } from "../common/error/error-factory";
import type { PageCreate } from "../api/v1/request/page.request";
import type { Page } from "../model/page.model";
import { PagesService } from "./pages.service";

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*_`~]/g, "")
    .replace(/[\s.:!?]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The note shows its title above the body, so markdown that opens with the
 * same title as a heading (as agents usually write it) would show it twice:
 * drop that first heading. Any other first heading stays.
 */
export function dropTitleHeading(markdown: string, title: string | undefined): string {
  if (!title?.trim()) return markdown;
  const m = /^\s*#{1,2}[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(markdown);
  if (!m || normal(m[1]!) !== normal(title)) return markdown;
  return markdown.slice(m[0].length).replace(/^\s*\n/, "");
}

@Injectable()
export class NoteMarkdownService {
  constructor(
    private readonly pages: PagesService,
  ) {}

  /** The note as markdown (lossy for layout, keeps the content). */
  async read(pageId: string, actorUserId: string | null) {
    const { page } = await this.pages.getOne(pageId, actorUserId);
    return {
      id: page.id,
      title: page.title,
      markdown: await noteDocumentToMarkdown(page.document),
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  /** A new note, optionally filled from markdown (the plan limit applies as usual). */
  async create(workspaceId: string, input: PageCreate, actorUserId: string): Promise<Page> {
    const { markdown, ...rest } = input;
    const page = await this.pages.create(workspaceId, rest, actorUserId);
    return markdown?.trim() ? this.write(page.id, dropTitleHeading(markdown, page.title), undefined, actorUserId) : page;
  }

  /** Replace the note's content (and optionally its title) with markdown. */
  async replace(pageId: string, markdown: string, title: string | undefined, actorUserId: string): Promise<Page> {
    const shownTitle = title ?? (await this.pages.getOne(pageId, actorUserId)).page.title;
    return this.write(pageId, dropTitleHeading(markdown, shownTitle), title, actorUserId);
  }

  private async write(pageId: string, markdown: string, title: string | undefined, actorUserId: string): Promise<Page> {
    const document = await markdownToNoteDocument(markdown);
    return this.pages.update(
      pageId,
      { document, contentMd: markdown, ...(title ? { title } : {}) },
      actorUserId,
    );
  }

  /** Add markdown to the end of the note. */
  async append(pageId: string, markdown: string, actorUserId: string): Promise<Page> {
    // Check access before reading or converting anything; update() checks edit.
    const { page: existing } = await this.pages.getOne(pageId, actorUserId);
    if (existing.deletedAt) throw NotFound("Page not found.");
    const current = (existing.document as { blocks?: unknown[] } | null)?.blocks ?? [];
    const added = (await markdownToNoteDocument(markdown)).blocks;
    const contentMd = [existing.contentMd, markdown].filter((s) => s && s.trim()).join("\n\n");
    return this.pages.update(
      pageId,
      { document: { blocks: [...current, ...added] }, contentMd },
      actorUserId,
    );
  }
}
