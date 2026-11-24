// Client-safe barrel. Server fetchers live in ./api/decks-api (server-only).
// A plain client component (like CanvasPane); BlockNote and the canvas inside it load lazily.
export { DeckEditor } from "./components/deck-editor";
export {
  createDeckClientApi,
  deleteDeckClientApi,
  getDeckClientApi,
  listDecksClientApi,
  moveDeckClientApi,
  updateDeckClientApi,
} from "./api/decks-client-api";
export type { Deck, DeckSummary } from "./types";
export { MakePresentationButton } from "./components/make-presentation-button";
