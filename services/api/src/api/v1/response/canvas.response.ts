import type { Role } from "../../../common/permissions.service";
import type { Canvas } from "../../../model/canvas.model";
import { sharingToDto, type SharingDto } from "./sharing.response";

export interface CanvasDto extends SharingDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  notebookId: string | null;
  title: string;
  document: unknown;
  thumbnailUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Also feeds the notes `/canvas` picker, which includes project canvases. */
export interface CanvasSummaryDto {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  notebookId: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; email: string } | null;
}

export function canvasToDto(canvas: Canvas, myRole?: Role): CanvasDto {
  return {
    id: canvas.id,
    workspaceId: canvas.workspaceId,
    projectId: canvas.projectId,
    notebookId: canvas.notebookId,
    title: canvas.title,
    document: canvas.document,
    thumbnailUrl: canvas.thumbnailUrl,
    settings: canvas.settings,
    ...sharingToDto(canvas, myRole),
    createdAt: canvas.createdAt.toISOString(),
    updatedAt: canvas.updatedAt.toISOString(),
    deletedAt: canvas.deletedAt ? canvas.deletedAt.toISOString() : null,
  };
}
