import type { notebooks } from "../db/schemas/notebooks";
import { pickSharing, type SharingState } from "./sharing.model";

export interface Notebook extends SharingState {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  icon: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Live per-person grants; list endpoints only. */
  sharedCount?: number;
  /** Live items inside, by kind; list endpoints only. */
  counts?: { notes: number; canvases: number; projects: number };
}

export function toNotebook(
  row: typeof notebooks.$inferSelect & {
    sharedCount?: number;
    noteCount?: number;
    canvasCount?: number;
    projectCount?: number;
  },
): Notebook {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    icon: row.icon,
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.sharedCount !== undefined ? { sharedCount: Number(row.sharedCount) } : {}),
    ...(row.noteCount !== undefined
      ? {
          counts: {
            notes: Number(row.noteCount),
            canvases: Number(row.canvasCount ?? 0),
            projects: Number(row.projectCount ?? 0),
          },
        }
      : {}),
  };
}
