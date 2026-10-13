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
      emptyKind="notebook"
      emptyMessage="No notebooks yet. Use them to group notes, canvases and projects — and share or publish them together."
      rows={notebooks.map((n) => ({
        kind: "notebook",
        id: n.id,
        title: n.name,
        subtitle: n.counts ? contentsLabel(n.counts) : undefined,
        access: accessOf(n),
        sharedCount: n.sharedCount ?? 0,
        owner: n.createdByUserId === me.user.id ? me.user.name : null,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }))}
    />
  );
}

/** "3 notes · 1 canvas · 2 projects" — what a notebook holds. */
function contentsLabel(c: {
  notes: number;
  canvases: number;
  projects: number;
}) {
  const part = (n: number, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : null;
  return (
    [
      part(c.notes, "note", "notes"),
      part(c.canvases, "canvas", "canvases"),
      part(c.projects, "project", "projects"),
    ]
      .filter(Boolean)
      .join(" · ") || "Empty"
  );
}
