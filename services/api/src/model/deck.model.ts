import type { decks } from "../db/schemas/decks";
import { pickSharing, type SharingState } from "./sharing.model";

export interface DeckSourceRef {
  kind: "page" | "project" | "notebook";
  id: string;
  split: "heading" | "divider";
}

export interface Deck extends SharingState {
  id: string;
  workspaceId: string;
  notebookId: string | null;
  createdByUserId: string;
  title: string;
  /** A @octonote/slides deck, repaired on save (see DecksService). */
  document: unknown;
  source: DeckSourceRef | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDeck(row: typeof decks.$inferSelect): Deck {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    notebookId: row.notebookId,
    createdByUserId: row.createdByUserId,
    title: row.title,
    document: row.document,
    source: row.source ?? null,
    ...pickSharing(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
