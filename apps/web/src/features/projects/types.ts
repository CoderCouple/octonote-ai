import type { Project, ProjectCreate, ProjectUpdate, ProjectView } from "@octonote/shared";

export type { Project, ProjectCreate, ProjectUpdate, ProjectView };

/** `GET /projects/:id` and `POST .../projects` add the ids of the owned pair. */
export type ProjectWithPair = Project & { noteId: string | null; canvasId: string | null };
