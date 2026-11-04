/**
 * Canvas figures: titled groups of shapes that notes embed as images.
 *
 * The canvas editor exports each changed figure as a PNG and PUTs it here;
 * the API overwrites the figure's fixed object in the `canvas-figures` bucket
 * (service role), so embeds always show the latest picture.
 *
 * Every figure has its own link (/f/<id>) and image (/f/<id>.png). You can see
 * one if you can read its canvas or a note that shows it (by sharing, or because
 * either is published, directly or through its project or notebook), or if the
 * figure was published by itself. Seeing a figure doesn't reveal its canvas.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { figureApiId } from "@octonote/shared";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { BadRequest, Conflict, NotFound, ServerError } from "../common/error/error-factory";
import { ChangeEventsService } from "../common/change-events.service";
import { PermissionsService, type ResourceLocator } from "../common/permissions.service";
import { Database, DRIZZLE } from "../db/database.module";
import { canvases } from "../db/schemas/canvases";
import { SharingRepository } from "../db/repository/sharing.repository";
import { canvasFigures, figureEmbeds } from "../db/schemas/figures";
import { appUrl } from "./lib/resource-url";
import { figureIdsIn } from "./lib/figure-urls";
import { WorkspacesService } from "./workspaces.service";

export const FIGURES_BUCKET = "canvas-figures";
const MAX_PNG_BYTES = 5 * 1024 * 1024;
const FIGURE_ID = /^fig_[0-9a-f-]{36}$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

export interface FigureInput {
  title: string;
  width: number;
  height: number;
  contentHash: string;
  /** Base64 PNG. Omit to update only the title/size/hash. */
  png?: string;
}

export interface FigureDto {
  id: string;
  canvasId: string;
  canvasTitle?: string;
  title: string;
  /** The figure's page. */
  url: string;
  /** Its image, with a version query so a changed picture is fetched again. */
  imageUrl: string | null;
  /** Published by itself (not through its canvas or a note). */
  publishedAt: string | null;
  width: number;
  height: number;
  contentHash: string | null;
  updatedAt: string;
}

/** One figure as its viewer may see it: the canvas is named only if they can reach it. */
export interface FigureView extends Omit<FigureDto, "canvasId"> {
  canvasId: string | null;
  /** Where this viewer can open the canvas; null if they can't. */
  canvasHref: string | null;
  /** Can publish or unpublish it by itself. */
  canPublish: boolean;
  /** Anyone can open it, signed out. */
  public: boolean;
  /** Can change the canvas, so their browser can draw a missing picture. */
  canEdit: boolean;
  /** What to draw, when the picture is missing and this viewer can make it. */
  draw: { source: string; placements?: unknown } | null;
}

export interface FigureImage {
  /** Null when the caller's `ifNoneMatch` is still current. */
  bytes: Buffer | null;
  etag: string;
}

type Row = typeof canvasFigures.$inferSelect;

/** How long a signed picture link lasts, for places without a sign-in (assistant cards). */
const SIGNED_IMAGE_SECONDS = 60 * 60;

@Injectable()
export class FiguresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissions: PermissionsService,
    private readonly workspaces: WorkspacesService,
    private readonly sharing: SharingRepository,
    private readonly changeEvents: ChangeEventsService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async upsert(
    canvasId: string,
    figureId: string,
    input: FigureInput,
    actorUserId: string,
  ): Promise<FigureDto> {
    if (!FIGURE_ID.test(figureId)) throw BadRequest("Invalid figure id.");
    const access = await this.permissions.require(actorUserId, { kind: "canvas", id: canvasId }, "edit");
    const existing = await this.row(figureId);
    if (existing && existing.canvasId !== canvasId) {
      throw Conflict("That figure belongs to another canvas.");
    }

    let imagePath = existing?.imagePath ?? null;
    if (input.png) {
      const bytes = Buffer.from(input.png, "base64");
      if (bytes.length === 0 || bytes.length > MAX_PNG_BYTES) {
        throw BadRequest("Figure image must be a PNG under 5 MB.");
      }
      if (!bytes.subarray(0, 4).equals(PNG_MAGIC)) throw BadRequest("Figure image must be a PNG.");
      imagePath = `${figureId}.png`;
      const { error } = await this.supabase.storage.from(FIGURES_BUCKET).upload(imagePath, bytes, {
        contentType: "image/png",
        upsert: true,
        // Short cache: the URL is stable and the picture changes as the canvas does.
        cacheControl: "60",
      });
      if (error) throw ServerError(`Figure image upload failed: ${error.message}`);
    }

    const values = {
      title: input.title.trim() || "Figure",
      width: Math.round(input.width),
      height: Math.round(input.height),
      contentHash: input.contentHash,
      imagePath,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(canvasFigures)
      .values({
        id: figureId,
        canvasId,
        workspaceId: access.workspaceId,
        createdByUserId: actorUserId,
        ...values,
      })
      .onConflictDoUpdate({ target: canvasFigures.id, set: values })
      .returning();
    return this.toDto(row!);
  }

  async remove(canvasId: string, figureId: string, actorUserId: string): Promise<void> {
    await this.permissions.require(actorUserId, { kind: "canvas", id: canvasId }, "edit");
    const existing = await this.row(figureId);
    if (!existing || existing.canvasId !== canvasId) return;
    await this.db.delete(canvasFigures).where(eq(canvasFigures.id, figureId));
    if (existing.imagePath) {
      // Best effort: an orphaned image is harmless (unguessable, unreferenced).
      await this.supabase.storage.from(FIGURES_BUCKET).remove([existing.imagePath]);
    }
  }

  async listForCanvas(canvasId: string, actorUserId: string | null): Promise<FigureDto[]> {
    await this.permissions.require(actorUserId, { kind: "canvas", id: canvasId }, "view");
    const rows = await this.db
      .select()
      .from(canvasFigures)
      .where(eq(canvasFigures.canvasId, canvasId))
      .orderBy(desc(canvasFigures.updatedAt));
    return rows.map((r) => this.toDto(r));
  }

  /** Every figure on the workspace's live canvases — the note's "/figure" picker. */
  async listForWorkspace(workspaceId: string, actorUserId: string): Promise<FigureDto[]> {
    await this.workspaces.requireRole(actorUserId, workspaceId, ["OWNER", "ADMIN", "MEMBER"]);
    const rows = await this.db
      .select({ figure: canvasFigures, canvasTitle: canvases.title })
      .from(canvasFigures)
      .innerJoin(canvases, eq(canvases.id, canvasFigures.canvasId))
      .where(and(eq(canvasFigures.workspaceId, workspaceId), isNull(canvases.deletedAt)))
      .orderBy(desc(canvasFigures.updatedAt));
    return rows
      .filter((r) => r.figure.imagePath)
      .map((r) => ({ ...this.toDto(r.figure), canvasTitle: r.canvasTitle }));
  }

  /** One figure, if you can see it (see the top of this file); otherwise 404. */
  async get(figureId: string, actorUserId: string | null): Promise<FigureView> {
    const row = await this.visibleRow(figureId, actorUserId);
    const canvasAccess = await this.viewAccess(actorUserId, { kind: "canvas", id: row.canvasId });
    const inApp = canvasAccess ? await this.canvasAppHref(row.canvasId) : null;
    const canvasHref = inApp ?? (await this.canvasPublicHref(row.canvasId));
    const canEdit = canvasAccess?.role === "owner" || canvasAccess?.role === "editor";
    return {
      ...this.toDto(row),
      canvasId: canvasHref ? row.canvasId : null,
      canvasHref,
      canPublish: canvasAccess?.role === "owner",
      public: await this.canSee(row, null),
      canEdit,
      draw: canEdit && !row.imagePath ? await this.drawing(row) : null,
    };
  }

  /**
   * Gives every figure on a saved canvas its record, so it has a link from the
   * start. Pictures come later. Records with no picture whose figure has gone are
   * removed; ones with a picture stay, since notes may still show them.
   */
  async syncCanvasRows(canvasId: string, workspaceId: string, document: unknown, actorUserId: string): Promise<void> {
    const raw = (document as { items?: { id?: unknown; type?: unknown; source?: unknown }[] } | null)?.items;
    const wanted = new Map<string, string>();
    for (const item of Array.isArray(raw) ? raw : []) {
      if (item?.type !== "figure" || typeof item.id !== "string") continue;
      const title = /^\s*title\s+(.+)$/m.exec(String(item.source ?? ""))?.[1]?.trim();
      wanted.set(figureApiId(canvasId, item.id), title || "Figure");
    }
    const existing = await this.db
      .select({ id: canvasFigures.id, imagePath: canvasFigures.imagePath })
      .from(canvasFigures)
      .where(eq(canvasFigures.canvasId, canvasId));
    const gone = existing.filter((r) => !r.imagePath && !wanted.has(r.id)).map((r) => r.id);
    if (gone.length) await this.db.delete(canvasFigures).where(inArray(canvasFigures.id, gone));
    const had = new Set(existing.map((r) => r.id));
    const missing = [...wanted].filter(([id]) => !had.has(id));
    if (missing.length) {
      await this.db
        .insert(canvasFigures)
        .values(missing.map(([id, title]) => ({ id, canvasId, workspaceId, title, createdByUserId: actorUserId })))
        .onConflictDoNothing();
    }
  }

  /** The stored picture, if you can see the figure. Skips the download when `ifNoneMatch` is current. */
  async image(figureId: string, actorUserId: string | null, ifNoneMatch?: string): Promise<FigureImage> {
    const row = await this.visibleRow(figureId, actorUserId);
    if (!row.imagePath) throw NotFound("Figure not found.");
    const etag = `"${row.updatedAt.getTime()}"`;
    if (ifNoneMatch === etag) return { bytes: null, etag };
    const { data, error } = await this.supabase.storage.from(FIGURES_BUCKET).download(row.imagePath);
    if (error || !data) throw NotFound("Figure not found.");
    return { bytes: Buffer.from(await data.arrayBuffer()), etag };
  }

  /** Publish one figure by itself. Same right as publishing its canvas. */
  async setPublished(figureId: string, published: boolean, actorUserId: string): Promise<FigureView> {
    const existing = await this.row(figureId);
    if (!existing) throw NotFound("Figure not found.");
    const access = await this.permissions.require(actorUserId, { kind: "canvas", id: existing.canvasId }, "manage");
    if (published && !existing.imagePath) throw Conflict("This figure's picture isn't ready yet. Try again in a moment.");
    await this.db
      .update(canvasFigures)
      .set({ publishedAt: published ? (existing.publishedAt ?? new Date()) : null })
      .where(eq(canvasFigures.id, figureId));
    await this.changeEvents.record({
      workspaceId: access.workspaceId,
      userId: actorUserId,
      entityType: "canvas",
      entityId: existing.canvasId,
      action: published ? "figure.publish" : "figure.unpublish",
      patch: { figureId },
    });
    return this.get(figureId, actorUserId);
  }

  /**
   * Short-lived picture links for a canvas's figures, by figure id. For places
   * with no sign-in of their own, such as assistant cards.
   */
  async signedImagesForCanvas(canvasId: string, actorUserId: string): Promise<Map<string, string>> {
    await this.permissions.require(actorUserId, { kind: "canvas", id: canvasId }, "view");
    const rows = await this.db.select().from(canvasFigures).where(eq(canvasFigures.canvasId, canvasId));
    return this.signedImages(rows);
  }

  /**
   * Replaces the pictures in a note with short-lived links, for the same places.
   * Only for someone who can read the note: it shows them these figures anyway.
   */
  async withSignedImages(document: unknown): Promise<unknown> {
    const ids = figureIdsIn(document);
    if (!ids.length) return document;
    const rows = await this.db.select().from(canvasFigures).where(inArray(canvasFigures.id, ids));
    const signed = await this.signedImages(rows);
    const swap = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(swap);
      if (!value || typeof value !== "object") return value;
      const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]));
      const url = typeof out.figureId === "string" ? signed.get(out.figureId) : undefined;
      return url ? { ...out, imageUrl: url } : out;
    };
    return swap(document);
  }

  /**
   * Records which figures a note shows, after a save. A new one only counts if
   * the person saving can see it, or anyone could write a figure's id into their
   * own note, publish it, and expose someone's private figure.
   */
  async syncNoteEmbeds(pageId: string, document: unknown, actorUserId: string): Promise<void> {
    const ids = new Set(figureIdsIn(document));
    const existing = await this.db
      .select({ figureId: figureEmbeds.figureId })
      .from(figureEmbeds)
      .where(eq(figureEmbeds.pageId, pageId));
    const had = new Set(existing.map((e) => e.figureId));
    const gone = [...had].filter((id) => !ids.has(id));
    if (gone.length) {
      await this.db
        .delete(figureEmbeds)
        .where(and(eq(figureEmbeds.pageId, pageId), inArray(figureEmbeds.figureId, gone)));
    }
    for (const figureId of ids) {
      if (had.has(figureId)) continue;
      const row = await this.row(figureId);
      // Not there yet (the note was written first): checked once someone asks for it.
      if (row && !(await this.canSee(row, actorUserId))) continue;
      await this.db
        .insert(figureEmbeds)
        .values({ pageId, figureId, addedByUserId: actorUserId, verified: Boolean(row) })
        .onConflictDoNothing();
    }
  }

  private async visibleRow(figureId: string, actorUserId: string | null): Promise<Row> {
    const row = await this.row(figureId);
    // The same answer for "doesn't exist" and "not yours", so ids reveal nothing.
    if (!row || !(await this.canSee(row, actorUserId))) throw NotFound("Figure not found.");
    return row;
  }

  private async canSee(row: Row, actorUserId: string | null): Promise<boolean> {
    if (row.publishedAt) return true;
    if (await this.canRead(actorUserId, { kind: "canvas", id: row.canvasId })) return true;
    const embeds = await this.db.select().from(figureEmbeds).where(eq(figureEmbeds.figureId, row.id));
    for (const embed of embeds) {
      if (!(await this.canRead(actorUserId, { kind: "page", id: embed.pageId }))) continue;
      if (embed.verified || (await this.verifyEmbed(row, embed))) return true;
    }
    return false;
  }

  /** A note saved before its figure existed counts only if whoever saved it can see the figure. */
  private async verifyEmbed(row: Row, embed: typeof figureEmbeds.$inferSelect): Promise<boolean> {
    if (!embed.addedByUserId || !(await this.canRead(embed.addedByUserId, { kind: "canvas", id: row.canvasId }))) {
      return false;
    }
    await this.db
      .update(figureEmbeds)
      .set({ verified: true })
      .where(and(eq(figureEmbeds.pageId, embed.pageId), eq(figureEmbeds.figureId, row.id)));
    return true;
  }

  private async drawing(row: Row): Promise<FigureView["draw"]> {
    const [canvas] = await this.db
      .select({ document: canvases.document })
      .from(canvases)
      .where(eq(canvases.id, row.canvasId))
      .limit(1);
    const items = (canvas?.document as { items?: { id?: unknown; type?: unknown; source?: unknown; placements?: unknown }[] } | null)?.items;
    const item = (Array.isArray(items) ? items : []).find(
      (i) => i?.type === "figure" && typeof i.id === "string" && figureApiId(row.canvasId, i.id) === row.id,
    );
    return typeof item?.source === "string" ? { source: item.source, placements: item.placements } : null;
  }

  private async canRead(actorUserId: string | null, locator: ResourceLocator): Promise<boolean> {
    return Boolean(await this.viewAccess(actorUserId, locator)) || Boolean(await this.publishedRoot(locator));
  }

  /** Access by account or link; null if none (or the item is gone). Publishing isn't counted here. */
  private async viewAccess(actorUserId: string | null, locator: ResourceLocator) {
    return this.permissions.require(actorUserId, locator, "view").catch(() => null);
  }

  /** The item itself or the ancestor that makes it public, if any. */
  private async publishedRoot(locator: ResourceLocator) {
    let cursor: ResourceLocator | null = locator;
    while (cursor) {
      const found: Awaited<ReturnType<SharingRepository["findResource"]>> = await this.sharing.findResource(cursor.kind, cursor.id);
      if (!found) return null;
      if (found.publishedAt) return found;
      cursor = found.parent;
    }
    return null;
  }

  private async canvasAppHref(canvasId: string): Promise<string> {
    const canvas = await this.sharing.findResource("canvas", canvasId);
    return canvas?.parent?.kind === "project" ? `/p/${canvas.parent.id}?view=canvas` : `/c/${canvasId}`;
  }

  private async canvasPublicHref(canvasId: string): Promise<string | null> {
    const root = await this.publishedRoot({ kind: "canvas", id: canvasId });
    if (!root?.publicSlug) return null;
    if (root.kind === "canvas" || root.kind === "project") return `/pub/${root.publicSlug}`;
    return `/pub/${root.publicSlug}/canvas/${canvasId}`;
  }

  private async signedImages(rows: Row[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    await Promise.all(
      rows.map(async (row) => {
        if (!row.imagePath) return;
        const { data } = await this.supabase.storage
          .from(FIGURES_BUCKET)
          .createSignedUrl(row.imagePath, SIGNED_IMAGE_SECONDS);
        if (data?.signedUrl) out.set(row.id, data.signedUrl);
      }),
    );
    return out;
  }

  private async row(figureId: string): Promise<Row | null> {
    const [row] = await this.db
      .select()
      .from(canvasFigures)
      .where(eq(canvasFigures.id, figureId))
      .limit(1);
    return row ?? null;
  }

  private toDto(row: Row): FigureDto {
    const url = `${appUrl()}/f/${row.id}`;
    return {
      id: row.id,
      canvasId: row.canvasId,
      title: row.title,
      url,
      imageUrl: row.imagePath ? `${url}.png?v=${row.updatedAt.getTime()}` : null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      width: row.width,
      height: row.height,
      contentHash: row.contentHash,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
