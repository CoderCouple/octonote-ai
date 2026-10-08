import type { pages } from "../db/schemas/pages";
import { pickSharing, type SharingState } from "./sharing.model";

export interface Page extends SharingState {
  id: string;
  workspaceId: string;
  /** Set when the note belongs to a project; then notebookId is null. */
  projectId: string | null;
  notebookId: string | null;
  createdByUserId: string;
  title: string;
  document: unknown;
  contentMd: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toPage(row: typeof pages.$inferSelect): Page {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    notebookId: row.notebookId,
    createdByUserId: row.createdByUserId,
    title: row.title,
    document: row.document,
    contentMd: row.contentMd,
    settings: (row.settings as Record<string, unknown>) ?? {},
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
