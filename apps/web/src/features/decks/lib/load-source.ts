"use client";

import type { CanvasSource, NotebookEntry, NoteBlock, NoteSource, ProjectSource } from "@octonote/slides";
import { clientApi } from "@/lib/api/client-fetch";

/** What "Make presentation" can start from. */
export type DeckSourceRef = { kind: "page" | "project" | "notebook"; id: string; title: string };

export type LoadedSource =
  | { kind: "page"; note: NoteSource }
  | { kind: "project"; project: ProjectSource }
  | { kind: "notebook"; notebook: { title: string; items: NotebookEntry[] } };

const blocksOf = (document: unknown): NoteBlock[] =>
  document && typeof document === "object" && Array.isArray((document as { blocks?: unknown }).blocks) ? ((document as { blocks: NoteBlock[] }).blocks) : [];

async function loadNote(id: string): Promise<NoteSource> {
  const page = await clientApi.get<{ title: string; document: unknown }>(`/pages/${id}`);
  return { title: page.title, blocks: blocksOf(page.document) };
}

/** A canvas and its slides (frames and figures in the order its own presentation uses). */
async function loadCanvas(id: string, title?: string): Promise<CanvasSource> {
  const [canvas, { visibleSlides }, { toCanvasDocument }] = await Promise.all([
    clientApi.get<{ title: string; document: unknown }>(`/canvases/${id}`),
    import("@octonote/octodraw"),
    import("@/features/canvas/lib/document"),
  ]);
  const doc = toCanvasDocument(canvas.document);
  const slides = visibleSlides(doc).map((s) => ({ itemId: s.id, title: s.title }));
  return { title: title ?? canvas.title, canvasId: id, slides, document: canvas.document };
}

async function loadProject(id: string): Promise<ProjectSource> {
  const project = await clientApi.get<{ name: string; noteId: string | null; canvasId: string | null }>(`/projects/${id}`);
  const [note, canvas] = await Promise.all([
    project.noteId ? loadNote(project.noteId) : null,
    project.canvasId ? loadCanvas(project.canvasId, project.name) : null,
  ]);
  // An empty canvas adds nothing to the talk.
  const hasCanvas = canvas && ((canvas.document as { items?: unknown[] } | null)?.items?.length ?? 0) > 0;
  return { title: project.name, note, canvas: hasCanvas ? canvas : null };
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });

/** Everything in the notebook, in the order the notebook lists it (by name). */
async function loadNotebook(id: string): Promise<{ title: string; items: NotebookEntry[] }> {
  const contents = await clientApi.get<{
    notebook: { name: string };
    notes: { id: string; title: string }[];
    canvases: { id: string; title: string }[];
    projects: { id: string; name: string }[];
  }>(`/notebooks/${id}`);
  const refs = [
    ...contents.notes.map((n) => ({ kind: "page" as const, id: n.id, title: n.title })),
    ...contents.canvases.map((c) => ({ kind: "canvas" as const, id: c.id, title: c.title })),
    ...contents.projects.map((p) => ({ kind: "project" as const, id: p.id, title: p.name })),
  ].sort(byTitle);
  const items = await Promise.all(
    refs.map(async (ref): Promise<NotebookEntry> => {
      if (ref.kind === "page") return { kind: "page", ...(await loadNote(ref.id)) };
      if (ref.kind === "canvas") return { kind: "canvas", ...(await loadCanvas(ref.id)) };
      return { kind: "project", ...(await loadProject(ref.id)) };
    }),
  );
  return { title: contents.notebook.name, items };
}

export async function loadDeckSource(ref: DeckSourceRef): Promise<LoadedSource> {
  if (ref.kind === "page") return { kind: "page", note: await loadNote(ref.id) };
  if (ref.kind === "project") return { kind: "project", project: await loadProject(ref.id) };
  return { kind: "notebook", notebook: await loadNotebook(ref.id) };
}
