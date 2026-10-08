/**
 * Create / move / delete across the four resource kinds, so list views and
 * menus don't switch on kind themselves.
 */
import { createCanvasClientApi, deleteCanvasClientApi, moveCanvasClientApi } from "@/features/canvas";
import {
  createNotebookClientApi,
  deleteNotebookClientApi,
} from "@/features/notebooks/api/notebooks-client-api";
import { createNoteClientApi, deleteNoteClientApi, moveNoteClientApi } from "@/features/notes";
import {
  archiveProjectClientApi,
  createProjectClientApi,
  moveProjectClientApi,
} from "@/features/projects";
import { RESOURCE_PATH, type ResourceKind } from "@/features/sharing";

/** Creates an "Untitled …" resource and returns the path to open it at. */
export async function createResource(
  kind: ResourceKind,
  workspaceId: string,
  notebookId?: string,
): Promise<string> {
  const placement = notebookId ? { notebookId } : {};
  switch (kind) {
    case "page": {
      const n = await createNoteClientApi(workspaceId, { title: "Untitled", ...placement });
      return RESOURCE_PATH.page(n.id);
    }
    case "canvas": {
      const c = await createCanvasClientApi(workspaceId, { title: "Untitled canvas", ...placement });
      return RESOURCE_PATH.canvas(c.id);
    }
    case "project": {
      const p = await createProjectClientApi(workspaceId, { name: "Untitled project", ...placement });
      return RESOURCE_PATH.project(p.id);
    }
    case "notebook": {
      const nb = await createNotebookClientApi(workspaceId, { name: "Untitled notebook" });
      return RESOURCE_PATH.notebook(nb.id);
    }
  }
}

export async function deleteResource(kind: ResourceKind, id: string): Promise<void> {
  switch (kind) {
    case "page":
      await deleteNoteClientApi(id);
      return;
    case "canvas":
      await deleteCanvasClientApi(id);
      return;
    case "project":
      await archiveProjectClientApi(id);
      return;
    case "notebook":
      await deleteNotebookClientApi(id);
      return;
  }
}

export async function moveResource(
  kind: Exclude<ResourceKind, "notebook">,
  id: string,
  notebookId: string | null,
): Promise<void> {
  if (kind === "page") await moveNoteClientApi(id, notebookId);
  else if (kind === "canvas") await moveCanvasClientApi(id, notebookId);
  else await moveProjectClientApi(id, notebookId);
}
