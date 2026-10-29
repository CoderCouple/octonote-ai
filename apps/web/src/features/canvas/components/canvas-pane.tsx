"use client";

import {
  ArrowDownFromLine,
  ArrowRightFromLine,
  LayoutGrid,
  Network,
  Shapes,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EditableTitle } from "@/components/editable-title";
import { FocusHeader } from "@/components/focus-header";
import { SaveIndicator, type SaveState } from "@/components/save-indicator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { RearrangeDirection } from "../lib/rearrange";
import { OctoCanvas, type CanvasEditorApi } from "./octo-canvas-dynamic";

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
  const editorRef = useRef<CanvasEditorApi | null>(null);

  function rearrange(direction: RearrangeDirection) {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.rearrange(direction)) {
      toast.message("Add a few shapes first, then rearrange them.");
      return;
    }
    toast.message("Rearranged", {
      action: { label: "Undo", onClick: () => editor.undo() },
    });
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
              Auto-shape — pen strokes snap to clean shapes
            </TooltipContent>
          </Tooltip>
        ) : null}
        {editable ? (
          <>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0"
                      aria-label="Rearrange"
                    >
                      <Network className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  Rearrange — lay out the selected shapes (or the whole
                  canvas) so arrows cross less
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => rearrange("vertical")}>
                  <ArrowDownFromLine className="size-4" />
                  Rearrange vertically
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => rearrange("horizontal")}>
                  <ArrowRightFromLine className="size-4" />
                  Rearrange horizontally
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
