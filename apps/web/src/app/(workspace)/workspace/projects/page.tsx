import {
  accessOf,
  CreateButton,
  LibraryTable,
  notebookLookup,
} from "@/features/library";
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
  const lookup = notebookLookup(notebooks);
  return (
    <LibraryTable
      workspaceId={workspaceId}
      noun="projects"
      createAction={<CreateButton kind="project" workspaceId={workspaceId} />}
      emptyMessage="No projects yet. A project pairs one note with one canvas, side by side."
      rows={projects.map((p) => {
        const { notebook, notebookName, publishedVia } = lookup(
          p.notebookId,
          p,
        );
        return {
          kind: "project",
          id: p.id,
          title: p.name,
          subtitle: p.description ?? "Note + canvas",
          notebookId: p.notebookId,
          notebookName,
          access: accessOf(p, notebook),
          publishedVia,
          sharedCount: p.sharedCount ?? 0,
          owner: p.creator?.name ?? null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      })}
    />
  );
}
