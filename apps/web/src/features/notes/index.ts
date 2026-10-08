// Safe for server components to import. Server fetchers: ./api/notes-api.
// The BlockNote schema and canvas-reference context are client-only — import
// them by path (./lib/blocknote-schema, ./blocks/canvas-reference-context).
export { NotesPane } from "./components/notes-pane";
export {
  createNoteClientApi,
  deleteNoteClientApi,
  listNotesClientApi,
  moveNoteClientApi,
  updateNoteClientApi,
} from "./api/notes-client-api";
export { noteKeys } from "./constants";
export type { NoteSummary, Page } from "./types";
