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
}

export function toNotebook(row: typeof notebooks.$inferSelect): Notebook {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    icon: row.icon,
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
