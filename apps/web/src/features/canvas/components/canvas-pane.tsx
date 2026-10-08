"use client";

import { Shapes } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { can, PublishedViaBadge, ShareDialog, type AccessRole } from "@/features/sharing";
import { updateCanvasClientApi } from "../api/canvases-client-api";
import type { Canvas } from "../types";
import { OctoCanvas } from "./octo-canvas-dynamic";

interface CanvasPaneProps {
  canvas: Canvas;
  myRole: AccessRole;
  /** Inside a project the project header owns sharing; hide the per-canvas share button. */
  showShare?: boolean;
  /** Rendered before the title (e.g. a back link on the focus route). */
  leading?: React.ReactNode;
}

export function CanvasPane({ canvas, myRole, showShare = true, leading }: CanvasPaneProps) {
  const editable = can.edit(myRole);
  const [autoShape, setAutoShape] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [title, setTitle] = useState(canvas.title);

  async function rename(next: string) {
    const prev = title;
    setTitle(next);
    try {
      await updateCanvasClientApi(canvas.id, { title: next });
    } catch (err) {
      setTitle(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't rename.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card flex h-11 shrink-0 items-center gap-2 border-b px-2">
        {leading}
        {editable ? (
          <EditableTitle value={title} onSave={rename} placeholder="Untitled canvas" />
        ) : (
          <span className="truncate px-1 text-sm font-medium">{title || "Untitled canvas"}</span>
        )}
        {editable ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                pressed={autoShape}
                onPressedChange={setAutoShape}
                size="sm"
                aria-label="Auto-shape"
                className="size-8 p-0"
              >
                <Shapes className="size-3.5" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Auto-shape — pencil strokes snap to clean shapes</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">View only</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <PublishedViaBadge kind="canvas" id={canvas.id} />
          {showShare ? (
            <ShareDialog
              iconOnly
              kind="canvas"
              id={canvas.id}
              title={title}
              myRole={myRole}
              initialLinkAccess={canvas.linkAccess}
              initialLinkRole={canvas.linkRole}
            />
          ) : null}
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <OctoCanvas
          canvasId={canvas.id}
          initialDocument={canvas.document}
          initialThumbnailUrl={canvas.thumbnailUrl}
          readOnly={!editable}
          autoShape={autoShape}
          onSaveStateChange={setSaveState}
        />
      </div>
    </div>
  );
}
