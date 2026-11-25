import { clientApi } from "@/lib/api/client-fetch";
import type { DeckFromSource } from "@octonote/shared";
import type { Deck, DeckCreate, DeckSummary, DeckUpdate } from "../types";

export function listDecksClientApi(workspaceId: string) {
  return clientApi.get<DeckSummary[]>(`/workspaces/${workspaceId}/decks`);
}

export function createDeckClientApi(workspaceId: string, body: DeckCreate) {
  return clientApi.post<Deck>(`/workspaces/${workspaceId}/decks`, body);
}

export function getDeckClientApi(deckId: string) {
  return clientApi.get<Deck>(`/decks/${deckId}`);
}

export function updateDeckClientApi(deckId: string, body: DeckUpdate) {
  return clientApi.patch<Deck>(`/decks/${deckId}`, body);
}

export function moveDeckClientApi(deckId: string, notebookId: string | null) {
  return clientApi.post<Deck>(`/decks/${deckId}/move`, { notebookId });
}

export function deleteDeckClientApi(deckId: string) {
  return clientApi.delete<Deck>(`/decks/${deckId}`);
}

/** Made on the server from a note, project or notebook (the "Let AI design it" path). */
export function createDeckFromSourceClientApi(workspaceId: string, body: Partial<DeckFromSource> & Pick<DeckFromSource, "source">) {
  return clientApi.post<Deck>(`/workspaces/${workspaceId}/decks/from`, body);
}
