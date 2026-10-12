"use client";

import { Group, LayoutGrid, Shapes, Ungroup } from "lucide-react";
import type { Editor } from "tldraw";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Button } from "@/components/ui/button";
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
  const editorRef = useRef<Editor | null>(null);

  // Loaded on click so tldraw stays out of the page's first bundle.
  async function makeFigure() {
    const editor = editorRef.current;
    if (!editor) return;
    const { wrapSelectionInFigure } = await import("../lib/figures");
    if (!wrapSelectionInFigure(editor)) {
      toast.message("Select some shapes first, then make them a figure.");
    }
  }

  async function ungroup() {
    const editor = editorRef.current;
    if (!editor) return;
    const { ungroupSelection } = await import("../lib/figures");
    const result = ungroupSelection(editor);
    if (result === "noop")
      toast.message(
        "Select a figure to dissolve, or shapes inside one to lift them out.",
      );
  }

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
        {editable ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label="Make figure"
                  onClick={makeFigure}
                >
                  <Group className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Figure — group the selected shapes so you can embed them in a
                note
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0"
                  aria-label="Ungroup"
                  onClick={ungroup}
                >
                  <Ungroup className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Ungroup — dissolve a figure, or lift shapes out of it
              </TooltipContent>
            </Tooltip>
          </>
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
          onEditor={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>
    </div>
  );
}
