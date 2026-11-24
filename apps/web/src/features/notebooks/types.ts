import type { Notebook, NotebookCreate, NotebookUpdate } from "@octonote/shared";
import type { CanvasSummary } from "@/features/canvas";
import type { DeckSummary } from "@/features/decks";
import type { NoteSummary } from "@/features/notes";
import type { Project } from "@/features/projects";

export type { Notebook, NotebookCreate, NotebookUpdate };

export interface NotebookContents {
  notebook: Notebook;
  notes: NoteSummary[];
  canvases: CanvasSummary[];
  projects: Project[];
  /** Older API versions don't send it. */
  decks?: DeckSummary[];
}
