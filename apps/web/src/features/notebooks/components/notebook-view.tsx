"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import {
  accessOf,
  CreateMenu,
  LibraryTable,
  type LibraryRow,
} from "@/features/library";
import {
  can,
  PublishedViaBadge,
  ShareDialog,
  type AccessRole,
} from "@/features/sharing";
import { updateNotebookClientApi } from "../api/notebooks-client-api";
import type { NotebookContents } from "../types";
import { previewFromMarkdown } from "@octonote/shared";

export function NotebookView({
  contents,
  myRole,
  leading,
}: {
  contents: NotebookContents;
  myRole: AccessRole;
  leading?: React.ReactNode;
}) {
  const { notebook } = contents;
  const editable = can.edit(myRole);
  const [name, setName] = useState(notebook.name);

  async function rename(next: string) {
    const prev = name;
    setName(next);
    try {
      await updateNotebookClientApi(notebook.id, { name: next });
    } catch (err) {
      setName(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't rename.");
    }
  }

  const ws = notebook.workspaceId;
  const via = (item: { publishedAt: string | null }) =>
    !item.publishedAt && notebook.publishedAt ? name : null;
  const rows: LibraryRow[] = [
    ...contents.notes.map((n) => ({
      kind: "page" as const,
      id: n.id,
      title: n.title,
      subtitle: previewFromMarkdown(n.contentMd, n.title) || "Empty note",
      notebookId: n.notebookId,
      access: accessOf(n, notebook),
      publishedVia: via(n),
      sharedCount: n.sharedCount,
      owner: n.creator?.name ?? null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    })),
    ...contents.canvases.map((c) => ({
      kind: "canvas" as const,
      id: c.id,
      title: c.title,
      thumbnailUrl: c.thumbnailUrl,
      notebookId: c.notebookId,
      access: accessOf(c, notebook),
      publishedVia: via(c),
      sharedCount: c.sharedCount,
      owner: c.creator?.name ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    ...contents.projects.map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.description ?? "Note + canvas",
      thumbnailUrl: p.thumbnailUrl ?? null,
      notebookId: p.notebookId,
      access: accessOf(p, notebook),
      publishedVia: via(p),
      sharedCount: p.sharedCount ?? 0,
      owner: p.creator?.name ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  ];
  const lastUpdated = rows.reduce(
    (max, r) => (r.updatedAt > max ? r.updatedAt : max),
    notebook.updatedAt,
  );

  return (
    <div className="flex h-full flex-col">
      <FocusHeader
        leading={leading}
        icon={BookOpen}
        title={
          editable ? (
            <EditableTitle
              value={name}
              onSave={rename}
              placeholder="Untitled notebook"
            />
          ) : (
            <span className="truncate text-sm font-medium">{name}</span>
          )
        }
      >
        <PublishedViaBadge kind="notebook" id={notebook.id} />
        <ShareDialog
          kind="notebook"
          id={notebook.id}
          title={name}
          myRole={myRole}
          initialLinkAccess={notebook.linkAccess}
          initialLinkRole={notebook.linkRole}
        />
      </FocusHeader>
      <div className="flex-1 overflow-auto">
        <LibraryTable
          workspaceId={ws}
          rows={rows}
          noun="items"
          mixedKinds
          hideNotebookColumn
          rowActions={editable}
          emptyKind="notebook"
          emptyMessage="This notebook is empty. Add notes, canvases and projects — they're shared and published along with the notebook."
          createAction={
            editable ? (
              <CreateMenu
                kinds={["page", "canvas", "project"]}
                workspaceId={ws}
                notebookId={notebook.id}
              />
            ) : undefined
          }
          header={
            <div className="flex items-start gap-4">
              <span className="bg-muted grid size-12 shrink-0 place-items-center rounded-lg border">
                <BookOpen className="text-foreground-strong size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-foreground-strong truncate text-2xl font-semibold tracking-tight">
                  {name || "Untitled notebook"}
                </h1>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {rows.length} {rows.length === 1 ? "item" : "items"} · Updated{" "}
                  {formatDate(lastUpdated)}
                  {notebook.publishedAt ? " · Published to the web" : ""}
                </p>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
