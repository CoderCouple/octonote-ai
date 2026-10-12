/**
 * Canvas figures: titled groups of shapes that notes embed as images.
 *
 * The canvas editor exports each changed figure as a PNG and PUTs it here;
 * the API overwrites the figure's fixed object in the `canvas-figures` bucket
 * (service role), so embeds always show the latest picture. Reads follow the
 * canvas's own permissions — a figure is exactly as visible as its canvas.
 */
import { Inject, Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { SUPABASE_CLIENT } from "../auth/supabase.tokens";
import { BadRequest, Conflict, NotFound, ServerError } from "../common/error/error-factory";
import { PermissionsService } from "../common/permissions.service";
import { Database, DRIZZLE } from "../db/database.module";
import { canvases } from "../db/schemas/canvases";
import { canvasFigures } from "../db/schemas/figures";
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
  /** Public URL with a version query, so a changed image isn't served from cache. */
  imageUrl: string | null;
  width: number;
  height: number;
  contentHash: string | null;
  updatedAt: string;
}

type Row = typeof canvasFigures.$inferSelect;

@Injectable()
export class FiguresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissions: PermissionsService,
    private readonly workspaces: WorkspacesService,
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

  /** One figure, if you can view its canvas (signed out works for link-shared canvases). */
  async get(figureId: string, actorUserId: string | null): Promise<FigureDto> {
    const row = await this.row(figureId);
    if (!row) throw NotFound("Figure not found.");
    await this.permissions.require(actorUserId, { kind: "canvas", id: row.canvasId }, "view");
    return this.toDto(row);
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
    const base = row.imagePath
      ? this.supabase.storage.from(FIGURES_BUCKET).getPublicUrl(row.imagePath).data.publicUrl
      : null;
    return {
      id: row.id,
      canvasId: row.canvasId,
      title: row.title,
      imageUrl: base ? `${base}?v=${row.updatedAt.getTime()}` : null,
      width: row.width,
      height: row.height,
      contentHash: row.contentHash,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
