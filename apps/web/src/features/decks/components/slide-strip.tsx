"use client";

import { SLIDE_LAYOUTS, SlideOutline, type DeckDocument, type SlideLayout } from "@octonote/slides";
import { Copy, EyeOff, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LAYOUT_LABEL } from "../lib/labels";

export interface SlideStripProps {
  deck: DeckDocument;
  selected: number;
  editable: boolean;
  onSelect: (index: number) => void;
  onAdd: (layout: SlideLayout) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onToggleHidden: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

/** The slides down the left: click to edit, drag to reorder, ↑/↓ to move between them. */
export function SlideStrip({ deck, selected, editable, onSelect, onAdd, onDuplicate, onRemove, onToggleHidden, onMove }: SlideStripProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <nav
      aria-label="Slides"
      className="bg-muted/40 flex h-full w-44 shrink-0 flex-col gap-2 overflow-y-auto border-r p-2"
      onKeyDown={(e) => {
        const go = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (!go || (e.target as HTMLElement).dataset.slideThumb === undefined) return;
        e.preventDefault();
        if (e.altKey && editable) onMove(selected, selected + go);
        onSelect(Math.max(0, Math.min(deck.slides.length - 1, selected + go)));
      }}
    >
      <ol className="flex flex-col gap-2">
        {deck.slides.map((slide, i) => (
          <li
            key={slide.id}
            className={cn("group relative grid grid-cols-[16px_1fr] gap-1.5", over === i && dragging !== null && dragging !== i && "before:bg-primary before:absolute before:-top-1.5 before:right-0 before:left-5 before:h-0.5 before:rounded")}
            draggable={editable}
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              setOver(i);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== i) {
                onMove(dragging, dragging < i ? i - 1 : i);
                onSelect(dragging < i ? i - 1 : i);
              }
              setDragging(null);
              setOver(null);
            }}
          >
            <span className={cn("text-muted-foreground pt-1 text-right text-2xs tabular-nums", slide.hidden && "opacity-50")}>{i + 1}</span>
            <button
              type="button"
              data-slide-thumb=""
              aria-current={i === selected ? "true" : undefined}
              aria-label={`Slide ${i + 1}${slide.hidden ? " (hidden)" : ""}`}
              onClick={() => onSelect(i)}
              className={cn(
                `osl-theme-${deck.theme} relative aspect-video w-full overflow-hidden rounded-md border text-left`,
                "bg-[var(--osl-bg)] text-[var(--osl-fg)] focus-visible:ring-ring outline-none focus-visible:ring-2",
                i === selected && "ring-primary ring-2 ring-offset-1",
                slide.hidden && "opacity-45",
              )}
            >
              <SlideOutline slide={slide} />
              {slide.hidden ? <EyeOff className="text-muted-foreground absolute right-1 bottom-1 size-3" /> : null}
            </button>
            {editable ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" aria-label={`Slide ${i + 1} actions`} className="absolute top-1 right-1 size-6 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => onDuplicate(i)}>
                    <Copy className="size-4" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onToggleHidden(i)}>
                    <EyeOff className="size-4" /> {slide.hidden ? "Show when presenting" : "Skip when presenting"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={deck.slides.length <= 1} onSelect={() => onRemove(i)} className="text-destructive focus:text-destructive">
                    <Trash2 className="size-4" /> Delete slide
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-5 justify-start gap-1.5">
              <Plus className="size-3.5" /> Slide
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SLIDE_LAYOUTS.filter((l) => l !== "canvas").map((layout) => (
              <DropdownMenuItem key={layout} onSelect={() => onAdd(layout)}>
                {LAYOUT_LABEL[layout]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}
