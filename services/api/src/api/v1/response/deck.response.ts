import type { Role } from "../../../common/permissions.service";
import type { DeckSummaryRow } from "../../../db/repository/decks.repository";
import type { Deck, DeckSourceRef } from "../../../model/deck.model";
import { sharingToDto, type SharingDto } from "./sharing.response";

export interface DeckDto extends SharingDto {
  id: string;
  workspaceId: string;
  notebookId: string | null;
  title: string;
  document: unknown;
  source: DeckSourceRef | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DeckSummaryDto {
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

export function deckToDto(deck: Deck, myRole?: Role): DeckDto {
  return {
    id: deck.id,
    workspaceId: deck.workspaceId,
    notebookId: deck.notebookId,
    title: deck.title,
    document: deck.document,
    source: deck.source,
    ...sharingToDto(deck, myRole),
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
    deletedAt: deck.deletedAt ? deck.deletedAt.toISOString() : null,
  };
}

export function deckSummaryToDto(r: DeckSummaryRow): DeckSummaryDto {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}
