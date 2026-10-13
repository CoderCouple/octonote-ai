/**
 * Canvases from mermaid flowcharts — how the CLI and agents "draw". The
 * parsing and layout live in @octonote/content; this service adds
 * permissions and storage by going through CanvasesService, so every rule
 * (edit access, plan limits, audit) still applies.
 */
import { Injectable } from "@nestjs/common";
import { MermaidParseError, mermaidToCanvasDocument } from "@octonote/content/server";
import type { CanvasCreate } from "../api/v1/request/canvas.request";
import { BadRequest } from "../common/error/error-factory";
import type { Canvas } from "../model/canvas.model";
import { CanvasesService } from "./canvases.service";

@Injectable()
export class CanvasDiagramService {
  constructor(private readonly canvases: CanvasesService) {}

  /** A new canvas, optionally drawn from a flowchart. */
  async create(workspaceId: string, input: CanvasCreate, actorUserId: string): Promise<Canvas> {
    const { mermaid, ...rest } = input;
    // Parse before creating, so bad input doesn't leave an empty canvas behind.
    const document = mermaid ? draw(mermaid) : null;
    const canvas = await this.canvases.create(workspaceId, rest, actorUserId);
    return document ? this.canvases.update(canvas.id, { document }, actorUserId) : canvas;
  }

  /** Redraw an existing canvas from a flowchart (replaces what's on it). */
  async replace(canvasId: string, mermaid: string, title: string | undefined, actorUserId: string) {
    return this.canvases.update(
      canvasId,
      { document: draw(mermaid), ...(title ? { title } : {}) },
      actorUserId,
    );
  }
}

function draw(mermaid: string) {
  try {
    return mermaidToCanvasDocument(mermaid) as unknown as Record<string, unknown>;
  } catch (err) {
    if (err instanceof MermaidParseError) {
      throw BadRequest(err.message, { code: "MERMAID_INVALID", line: err.line ?? null });
    }
    throw err;
  }
}
