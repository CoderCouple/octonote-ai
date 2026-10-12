"use client";

import { Shapes, LayoutGrid } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  can,
  PublishedViaBadge,
  ShareDialog,
  type AccessRole,
} from "@/features/sharing";
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

export function CanvasPane({
  canvas,
  myRole,
  showShare = true,
  leading,
}: CanvasPaneProps) {
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
      <FocusHeader
        leading={leading}
        icon={LayoutGrid}
        title={
          <>
            {editable ? (
              <EditableTitle
                value={title}
                onSave={rename}
                placeholder="Untitled canvas"
              />
            ) : (
              <span className="truncate text-sm font-medium">
                {title || "Untitled canvas"}
              </span>
            )}
            {editable ? null : (
              <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-2xs">
                View only
              </span>
            )}
          </>
        }
      >
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
            <TooltipContent>
              Auto-shape — pencil strokes snap to clean shapes
            </TooltipContent>
          </Tooltip>
        ) : null}
        <SaveIndicator state={saveState} />
        <PublishedViaBadge kind="canvas" id={canvas.id} />
        {showShare ? (
          <ShareDialog
            kind="canvas"
            id={canvas.id}
            title={title}
            myRole={myRole}
            initialLinkAccess={canvas.linkAccess}
            initialLinkRole={canvas.linkRole}
          />
        ) : null}
      </FocusHeader>
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
