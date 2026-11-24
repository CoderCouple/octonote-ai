import "server-only";
import { serverFetch } from "@/lib/api/server-fetch";
import type { Deck, DeckSummary } from "../types";

export function getDeckApi(deckId: string) {
  return serverFetch<Deck>(`/decks/${deckId}`);
}

export function listDecksApi(workspaceId: string) {
  return serverFetch<DeckSummary[]>(`/workspaces/${workspaceId}/decks`);
}
