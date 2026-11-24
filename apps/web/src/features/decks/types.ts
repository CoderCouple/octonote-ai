import type { DeckDocument } from "@octonote/slides";
import type { DeckCreate, DeckSource, DeckUpdate } from "@octonote/shared";

export type { DeckCreate, DeckSource, DeckUpdate };

/** `GET /decks/:id`. */
export interface Deck {
  id: string;
  workspaceId: string;
  notebookId: string | null;
  title: string;
  /** Stored deck; read it through `toDeckDocument`, which repairs anything odd. */
  document: DeckDocument | unknown;
  source: DeckSource | null;
  linkAccess: "restricted" | "anyone_with_link";
  linkRole: "viewer" | "editor";
  publicSlug: string | null;
  publishedAt: string | null;
  myRole?: "viewer" | "editor" | "owner";
  createdAt: string;
  updatedAt: string;
}

/** Row from `GET /workspaces/:id/decks` and a notebook's contents. */
export interface DeckSummary {
  id: string;
  title: string;
  notebookId: string | null;
  slideCount: number;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; email: string } | null;
  linkAccess: "restricted" | "anyone_with_link";
  publishedAt: string | null;
  sharedCount: number;
}
