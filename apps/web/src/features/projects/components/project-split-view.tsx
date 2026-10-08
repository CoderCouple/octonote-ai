"use client";

/**
 * A project: its note and canvas side by side, or either one alone.
 * The chosen view persists as the project's `settings.defaultView`.
 */
import { Columns2, FileText, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CanvasPane, type Canvas } from "@/features/canvas";
import { NotesPane, type Page } from "@/features/notes";
import { can, PublishedViaBadge, ShareDialog, type AccessRole } from "@/features/sharing";
import { updateProjectClientApi } from "../api/projects-client-api";
import type { Project, ProjectView } from "../types";

interface ProjectSplitViewProps {
  project: Project;
  note: Page | null;
  canvas: Canvas | null;
  myRole: AccessRole;
  /** `?view=` from the URL wins over the saved default (e.g. links from canvas-reference blocks). */
  initialView?: ProjectView;
  leading?: React.ReactNode;
}

export function ProjectSplitView({
  project,
  note,
  canvas,
  myRole,
  initialView,
  leading,
}: ProjectSplitViewProps) {
  const editable = can.edit(myRole);
  const [view, setView] = useState<ProjectView>(
    initialView ?? project.settings.defaultView ?? "split",
  );
  const [name, setName] = useState(project.name);

  function changeView(next: ProjectView) {
    setView(next);
    if (!editable) return;
    void updateProjectClientApi(project.id, {
      settings: { ...project.settings, defaultView: next },
    }).catch(() => undefined);
  }

  async function rename(next: string) {
    const prev = name;
    setName(next);
    try {
      await updateProjectClientApi(project.id, { name: next });
    } catch (err) {
      setName(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't rename.");
    }
  }

  const showNote = view === "notes" || view === "split";
  const showCanvas = view === "canvas" || view === "split";

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {leading}
        {editable ? (
          <EditableTitle value={name} onSave={rename} size="lg" placeholder="Untitled project" />
        ) : (
          <span className="truncate text-base font-semibold">{name}</span>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={view}
          onValueChange={(v) => v && changeView(v as ProjectView)}
          className="mx-auto"
          aria-label="Layout"
        >
          <ToggleGroupItem value="notes" aria-label="Note only">
            <FileText className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="split" aria-label="Side by side">
            <Columns2 className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="canvas" aria-label="Canvas only">
            <LayoutGrid className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <PublishedViaBadge kind="project" id={project.id} />
          <ShareDialog
            kind="project"
            id={project.id}
            title={name}
            myRole={myRole}
            initialLinkAccess={project.linkAccess}
            initialLinkRole={project.linkRole}
          />
        </div>
      </header>
      {/* Panes stay mounted across layout changes so tldraw/BlockNote don't reload. */}
      <div className="flex flex-1 overflow-hidden">
        <div className={showNote ? (showCanvas ? "w-1/2 border-r" : "flex-1") : "hidden"}>
          {note ? (
            <NotesPane note={note} myRole={myRole} showShare={false} />
          ) : (
            <Missing label="This project's note was removed." />
          )}
        </div>
        <div className={showCanvas ? (showNote ? "w-1/2" : "flex-1") : "hidden"}>
          {canvas ? (
            <CanvasPane canvas={canvas} myRole={myRole} showShare={false} />
          ) : (
            <Missing label="This project's canvas was removed." />
          )}
        </div>
      </div>
    </div>
  );
}

function Missing({ label }: { label: string }) {
  return <div className="text-muted-foreground grid h-full place-items-center p-6 text-sm">{label}</div>;
}
