"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { CreateButton, ResourceList } from "@/features/library";
import { can, PublishedViaBadge, ShareDialog, type AccessRole } from "@/features/sharing";
import { updateNotebookClientApi } from "../api/notebooks-client-api";
import type { NotebookContents } from "../types";

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
  const sections = [
    {
      kind: "page" as const,
      title: "Notes",
      items: contents.notes.map((n) => ({
        kind: "page" as const,
        id: n.id,
        title: n.title,
        subtitle: n.contentMd.trim().slice(0, 140) || "Empty note",
        notebookId: n.notebookId,
        updatedAt: n.updatedAt,
      })),
    },
    {
      kind: "canvas" as const,
      title: "Canvases",
      items: contents.canvases.map((c) => ({
        kind: "canvas" as const,
        id: c.id,
        title: c.title,
        thumbnailUrl: c.thumbnailUrl,
        notebookId: c.notebookId,
        updatedAt: c.updatedAt,
      })),
    },
    {
      kind: "project" as const,
      title: "Projects",
      items: contents.projects.map((p) => ({
        kind: "project" as const,
        id: p.id,
        title: p.name,
        subtitle: p.description ?? undefined,
        notebookId: p.notebookId,
        updatedAt: p.updatedAt,
      })),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {leading}
        {editable ? (
          <EditableTitle value={name} onSave={rename} size="lg" placeholder="Untitled notebook" />
        ) : (
          <span className="truncate text-base font-semibold">{name}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <PublishedViaBadge kind="notebook" id={notebook.id} />
          <ShareDialog
            kind="notebook"
            id={notebook.id}
            title={name}
            myRole={myRole}
            initialLinkAccess={notebook.linkAccess}
            initialLinkRole={notebook.linkRole}
          />
        </div>
      </header>
      <div className="flex-1 overflow-auto pb-10">
        {sections.map((s) => (
          <div key={s.kind} className="mt-4">
            <div className="flex items-center justify-between px-6 pb-2 md:px-8">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{s.title}</h2>
              {editable ? (
                <CreateButton kind={s.kind} workspaceId={ws} notebookId={notebook.id} variant="outline" />
              ) : null}
            </div>
            <ResourceList
              workspaceId={ws}
              items={s.items}
              emptyMessage={`No ${s.title.toLowerCase()} in this notebook yet.`}
              readOnly={!editable}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
