import type { canvases } from "../db/schemas/canvases";
import { pickSharing, type SharingState } from "./sharing.model";

export interface Canvas extends SharingState {
  id: string;
  workspaceId: string;
  /** Set when the canvas belongs to a project; then notebookId is null. */
  projectId: string | null;
  notebookId: string | null;
  createdByUserId: string;
  title: string;
  document: unknown;
  thumbnailUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toCanvas(row: typeof canvases.$inferSelect): Canvas {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    notebookId: row.notebookId,
    createdByUserId: row.createdByUserId,
    title: row.title,
    document: row.document,
    thumbnailUrl: row.thumbnailUrl,
    settings: (row.settings as Record<string, unknown>) ?? {},
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
