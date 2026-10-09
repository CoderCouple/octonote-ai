import { listCanvasesApi } from "@/features/canvas/api/canvases-api";
import {
  accessOf,
  CreateButton,
  LibraryTable,
  notebookLookup,
} from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { activeWorkspaceId } from "../../_lib";

export default async function CanvasesPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [canvases, notebooks] = await Promise.all([
    listCanvasesApi(workspaceId),
    listNotebooksApi(workspaceId),
  ]);
  const lookup = notebookLookup(notebooks);
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="canvases"
      createAction={<CreateButton kind="canvas" workspaceId={workspaceId} />}
      emptyMessage="No canvases yet. Create one to start drawing."
      rows={canvases.map((c) => {
        const { notebook, notebookName, publishedVia } = lookup(
          c.notebookId,
          c,
        );
        return {
          kind: "canvas",
          id: c.id,
          title: c.title,
          thumbnailUrl: c.thumbnailUrl,
          notebookId: c.notebookId,
          notebookName,
          access: accessOf(c, notebook),
          publishedVia,
          sharedCount: c.sharedCount,
          owner: c.creator?.name ?? null,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      })}
    />
  );
}
