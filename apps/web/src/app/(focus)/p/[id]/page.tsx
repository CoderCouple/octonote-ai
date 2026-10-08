import { getCanvasApi } from "@/features/canvas/api/canvases-api";
import { getNoteApi } from "@/features/notes/api/notes-api";
import { ProjectSplitView } from "@/features/projects";
import { getProjectApi } from "@/features/projects/api/projects-api";
import { loadOrGate } from "@/lib/load-or-gate";
import { BackLink } from "../../_components/back-link";
import { NoAccess } from "../../_components/no-access";

const VIEWS = new Set(["notes", "canvas", "split"]);

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const res = await loadOrGate(() => getProjectApi(id), `/p/${id}`);
  if (!res.ok) return <NoAccess />;
  const project = res.data;
  // Access to the project implies access to its pair (they inherit from it).
  const [note, canvas] = await Promise.all([
    project.noteId ? getNoteApi(project.noteId).catch(() => null) : null,
    project.canvasId ? getCanvasApi(project.canvasId).catch(() => null) : null,
  ]);
  const back = project.notebookId ? `/nb/${project.notebookId}` : "/workspace/projects";
  return (
    <ProjectSplitView
      project={project}
      note={note}
      canvas={canvas}
      myRole={project.myRole ?? "viewer"}
      initialView={view && VIEWS.has(view) ? (view as "notes" | "canvas" | "split") : undefined}
      leading={<BackLink href={back} signedIn={res.signedIn} />}
    />
  );
}
