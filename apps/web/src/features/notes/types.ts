import type { Page, PageCreate, PageUpdate } from "@octonote/shared";

export type { Page, PageCreate, PageUpdate };

/** Row from `GET /workspaces/:id/pages` (standalone notes). */
export interface NoteSummary {
  id: string;
  title: string;
  notebookId: string | null;
  contentMd: string;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string; email: string } | null;
}
