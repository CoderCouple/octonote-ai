import type { projects } from "../db/schemas/projects";
import { pickSharing, type SharingState } from "./sharing.model";

export interface CreatorSummary {
  id: string;
  name: string;
  email: string;
}

export interface Project extends SharingState {
  id: string;
  workspaceId: string;
  notebookId: string | null;
  createdByUserId: string;
  name: string;
  description: string | null;
  icon: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  /** List-endpoint enrichment; undefined on single-project fetches. */
  hasNote?: boolean;
  hasCanvas?: boolean;
  creator?: CreatorSummary | null;
  /** Live per-person grants; list endpoints only. */
  sharedCount?: number;
}

export function toProject(
  row: typeof projects.$inferSelect & {
    hasNote?: boolean;
    hasCanvas?: boolean;
    creator?: CreatorSummary | null;
    sharedCount?: number;
  },
): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    notebookId: row.notebookId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    settings: (row.settings as Record<string, unknown>) ?? {},
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    ...(row.hasNote !== undefined ? { hasNote: row.hasNote } : {}),
    ...(row.hasCanvas !== undefined ? { hasCanvas: row.hasCanvas } : {}),
    ...(row.creator !== undefined ? { creator: row.creator } : {}),
    ...(row.sharedCount !== undefined ? { sharedCount: Number(row.sharedCount) } : {}),
  };
}
