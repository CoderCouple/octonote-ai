import { CreateButton, ResourceList } from "@/features/library";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { listProjectsApi } from "@/features/projects/api/projects-api";
import { activeWorkspaceId } from "../../_lib";

export default async function ProjectsPage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [projects, notebooks] = await Promise.all([
    listProjectsApi(workspaceId),
    listNotebooksApi(workspaceId),
  ]);
  const notebookName = new Map(notebooks.map((n) => [n.id, n.name]));
  return (
    <ResourceList
      title="Projects"
      workspaceId={workspaceId}
      actions={<CreateButton kind="project" workspaceId={workspaceId} />}
      emptyMessage="No projects yet. A project pairs one note with one canvas, side by side."
      items={projects.map((p) => ({
        kind: "project",
        id: p.id,
        title: p.name,
        subtitle: p.notebookId
          ? `in ${notebookName.get(p.notebookId) ?? "a notebook"}`
          : (p.description ?? "Note + canvas"),
        notebookId: p.notebookId,
        updatedAt: p.updatedAt,
      }))}
    />
  );
}
