import { listCanvasesApi } from "@/features/canvas/api/canvases-api";
import { CreateButton, ResourceList } from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { activeWorkspaceId } from "../../_lib";

export default async function CanvasesPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [canvases, notebooks] = await Promise.all([
    listCanvasesApi(workspaceId),
    listNotebooksApi(workspaceId),
  ]);
  const notebookName = new Map(notebooks.map((n) => [n.id, n.name]));
  return (
    <ResourceList
      title="Canvases"
      workspaceId={workspaceId}
      actions={<CreateButton kind="canvas" workspaceId={workspaceId} />}
      emptyMessage="No canvases yet. Create one to start drawing."
      items={canvases.map((c) => ({
        kind: "canvas",
        id: c.id,
        title: c.title,
        subtitle: c.notebookId ? `in ${notebookName.get(c.notebookId) ?? "a notebook"}` : undefined,
        thumbnailUrl: c.thumbnailUrl,
        notebookId: c.notebookId,
        updatedAt: c.updatedAt,
      }))}
    />
  );
}
