import { CreateButton, ResourceList } from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { activeWorkspaceId } from "../../_lib";

export default async function NotebooksPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const notebooks = await listNotebooksApi(workspaceId);
  return (
    <ResourceList
      title="Notebooks"
      workspaceId={workspaceId}
      actions={<CreateButton kind="notebook" workspaceId={workspaceId} />}
      emptyMessage="No notebooks yet. Use them to group notes, canvases and projects — and share or publish them together."
      items={notebooks.map((n) => ({
        kind: "notebook",
        id: n.id,
        title: n.name,
        subtitle: n.publishedAt ? "Published" : n.linkAccess === "anyone_with_link" ? "Anyone with the link" : undefined,
        updatedAt: n.updatedAt,
      }))}
    />
  );
}
