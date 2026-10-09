import { accessOf, CreateButton, LibraryTable } from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { getMeApi } from "@/features/workspaces/api/workspaces-api";
import { activeWorkspaceId } from "../../_lib";

export default async function NotebooksPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [notebooks, me] = await Promise.all([
    listNotebooksApi(workspaceId),
    getMeApi(),
  ]);
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="notebooks"
      hideNotebookColumn
      createAction={<CreateButton kind="notebook" workspaceId={workspaceId} />}
      emptyMessage="No notebooks yet. Use them to group notes, canvases and projects — and share or publish them together."
      rows={notebooks.map((n) => ({
        kind: "notebook",
        id: n.id,
        title: n.name,
        access: accessOf(n),
        sharedCount: n.sharedCount ?? 0,
        owner: n.createdByUserId === me.user.id ? me.user.name : null,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }))}
    />
  );
}
