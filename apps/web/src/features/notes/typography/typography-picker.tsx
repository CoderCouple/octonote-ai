/**
 * Popover-based picker for the reader font family, size, and line
 * height. Writes to the shared typography store so both edit + published
 * views react. When `onPersist` is provided, changes are also flushed to
 * the server (debounced) — omit for anon flows that only want the
 * localStorage snapshot.
 */
"use client";

import { Type } from "lucide-react";
import { useEffect, useRef } from "react";
import type {
  NotesFontFamily,
  NotesFontSize,
  NotesLineHeight,
} from "@octonote/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CONTENT_WIDTH_LABELS,
  FONT_FAMILY_LABELS,
  FONT_SIZE_LABELS,
  LINE_HEIGHT_LABELS,
  fontFamilyStack,
  type NotesContentWidth,
} from "./fonts";
import { useTypographyStore } from "./typography-store";

export interface TypographyPickerProps {
  /** Called on any change; use to persist to the server for logged-in users. */
  onPersist?: (patch: {
    notesFontFamily?: NotesFontFamily;
    notesFontSize?: NotesFontSize;
    notesLineHeight?: NotesLineHeight;
  }) => void;
  /** Debounce window before onPersist fires. Default 400ms. */
  persistDebounceMs?: number;
}

const FAMILIES: NotesFontFamily[] = [
  // Serif
  "fraunces",
  "instrument-serif",
  "georgia",
  "newsreader",
  // Sans
  "inter",
  "geist",
  "system",
  // Mono
  "ia-writer-mono",
];
const SIZES: NotesFontSize[] = ["sm", "md", "lg", "xl"];
const LINE_HEIGHTS: NotesLineHeight[] = ["compact", "normal", "relaxed"];
const WIDTHS: NotesContentWidth[] = ["narrow", "medium", "wide"];

export function TypographyPicker({
  onPersist,
  persistDebounceMs = 400,
}: TypographyPickerProps) {
  const family = useTypographyStore((s) => s.family);
  const size = useTypographyStore((s) => s.size);
  const lineHeight = useTypographyStore((s) => s.lineHeight);
  const width = useTypographyStore((s) => s.width);
  const setFamily = useTypographyStore((s) => s.setFamily);
  const setSize = useTypographyStore((s) => s.setSize);
  const setLineHeight = useTypographyStore((s) => s.setLineHeight);
  const setWidth = useTypographyStore((s) => s.setWidth);

  const pendingRef = useRef<{
    notesFontFamily?: NotesFontFamily;
    notesFontSize?: NotesFontSize;
    notesLineHeight?: NotesLineHeight;
  }>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const queuePersist = (patch: typeof pendingRef.current) => {
    if (!onPersist) return;
    pendingRef.current = { ...pendingRef.current, ...patch };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const p = pendingRef.current;
      pendingRef.current = {};
      onPersist(p);
    }, persistDebounceMs);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1.5"
          aria-label="Typography"
        >
          <Type className="size-4" />
          <span className="text-xs">Type</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-4 p-4" align="end">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Font
          </Label>
          <RadioGroup
            value={family}
            onValueChange={(v) => {
              const next = v as NotesFontFamily;
              setFamily(next);
              queuePersist({ notesFontFamily: next });
            }}
            className="grid grid-cols-1 gap-1"
          >
            {FAMILIES.map((f) => (
              <label
                key={f}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5"
              >
                <RadioGroupItem value={f} id={`font-${f}`} className="size-3" />
                <span
                  className="text-sm"
                  style={{ fontFamily: fontFamilyStack(f) }}
                >
                  {FONT_FAMILY_LABELS[f]}
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Size
          </Label>
          <div className="flex gap-1">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSize(s);
                  queuePersist({ notesFontSize: s });
                }}
                className={`flex-1 rounded border px-2 py-1 text-xs transition ${
                  size === s
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-accent"
                }`}
                aria-pressed={size === s}
              >
                {FONT_SIZE_LABELS[s].slice(0, 1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Line height
          </Label>
          <div className="flex gap-1">
            {LINE_HEIGHTS.map((lh) => (
              <button
                key={lh}
                type="button"
                onClick={() => {
                  setLineHeight(lh);
                  queuePersist({ notesLineHeight: lh });
                }}
                className={`flex-1 rounded border px-2 py-1 text-xs capitalize transition ${
                  lineHeight === lh
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-accent"
                }`}
                aria-pressed={lineHeight === lh}
              >
                {LINE_HEIGHT_LABELS[lh]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            Width
          </Label>
          <div className="flex gap-1">
            {WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                className={`flex-1 rounded border px-2 py-1 text-xs capitalize transition ${
                  width === w
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-accent"
                }`}
                aria-pressed={width === w}
              >
                {CONTENT_WIDTH_LABELS[w]}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
