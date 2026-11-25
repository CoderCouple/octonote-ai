"use client";

import { SHAPES, type DeckAspect, type SlideElement } from "@octonote/slides";
import { Blocks, ChevronDown, Clapperboard, Heading, ImagePlus, Shapes, Type } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { INTERACTIVE_LABELS } from "@/features/notes/blocks/interactive-block";
import { VideoDialog } from "@/features/notes/blocks/manim-video-block";
import { uploadNoteImage } from "@/features/notes/lib/upload-image";
import { blockFor, INSERTABLE_BLOCKS, newBlockObject, newImage, newShape, newTextBox, newVideoObject } from "../lib/insert";
import { SHAPE_LABEL } from "../lib/labels";

const BLOCK_LABEL: Record<(typeof INSERTABLE_BLOCKS)[number], string> = {
  ...(Object.fromEntries(Object.entries(INTERACTIVE_LABELS)) as Record<string, string>),
  mermaid: "Mermaid diagram",
  equation: "Equation",
  code: "Code",
} as Record<(typeof INSERTABLE_BLOCKS)[number], string>;

/** The bar above the slide: add a text box, a block, a picture or a shape. */
export function InsertBar({ aspect, deckId, workspaceId, onInsert }: { aspect: DeckAspect; deckId: string; workspaceId: string; onInsert: (element: SlideElement) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function addImage(file: File) {
    setUploading(true);
    try {
      const src = await uploadNoteImage(file, deckId);
      // Read its size so it keeps its shape.
      const natural = await new Promise<{ w: number; h: number } | undefined>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(undefined);
        img.src = src;
      });
      onInsert(newImage(aspect, src, natural));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the picture.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div role="toolbar" aria-label="Insert" className="bg-background flex items-center gap-1 border-b px-3 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Type className="size-4" /> Text <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onInsert(newTextBox(aspect, "title"))}>
            <Heading className="size-4" /> Title
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onInsert(newTextBox(aspect, "text"))}>
            <Type className="size-4" /> Text box
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Blocks className="size-4" /> Block <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-y-auto">
          {INSERTABLE_BLOCKS.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onInsert(newBlockObject(aspect, blockFor(kind)))}>
              {BLOCK_LABEL[kind] ?? kind}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setVideoOpen(true)}>
            <Clapperboard className="size-4" /> Explainer video (AI)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileInput.current?.click()}>
        <ImagePlus className="size-4" /> {uploading ? "Uploading…" : "Image"}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void addImage(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Shapes className="size-4" /> Shape <ChevronDown className="size-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {SHAPES.map((shape) => (
            <DropdownMenuItem key={shape} onSelect={() => onInsert(newShape(aspect, shape))}>
              {SHAPE_LABEL[shape]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-muted-foreground ml-auto hidden text-xs xl:block">Double-click an object to edit it · Shift-drag to keep its shape · Alt to move without snapping</span>
      <VideoDialog open={videoOpen} onOpenChange={setVideoOpen} workspaceId={workspaceId} onCreated={(videoId) => onInsert(newVideoObject(aspect, videoId))} />
    </div>
  );
}
