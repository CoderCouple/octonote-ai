"use client";

import {
  BUILD_EFFECTS,
  blockText,
  buildableBlocks,
  DECK_ASPECTS,
  DECK_THEMES,
  moveBuild,
  setBuild,
  SLIDE_LAYOUTS,
  SLIDE_TRANSITIONS,
  type BuildEffect,
  type DeckDocument,
  type DeckSlide,
  type NoteBlock,
  type SlideLayout,
  type SlideTransition,
} from "@octonote/slides";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { INTERACTIVE_LABELS } from "@/features/notes/blocks/interactive-block";
import { cn } from "@/lib/utils";
import { EFFECT_LABEL, LAYOUT_LABEL, THEME_LABEL, TRANSITION_LABEL } from "../lib/labels";

const BLOCK_NAME: Record<string, string> = {
  heading: "Heading",
  paragraph: "Text",
  bulletListItem: "Point",
  numberedListItem: "Point",
  checkListItem: "Checkbox",
  quote: "Quote",
  codeBlock: "Code",
  mathBlock: "Equation",
  mermaid: "Diagram",
  figure: "Figure",
  image: "Picture",
  table: "Table",
  manimVideo: "Video",
};

/** How a block is named in the builds list: its kind and the start of its text. */
function describe(block: NoteBlock): string {
  const kind = block.type === "interactive" ? (INTERACTIVE_LABELS[block.props?.kind] ?? "Block") : (BLOCK_NAME[block.type] ?? "Block");
  const text = blockText(block).trim();
  return text ? `${kind}: ${text.length > 36 ? `${text.slice(0, 35)}…` : text}` : kind;
}

/** A small preview of each layout for the picker. */
function LayoutIcon({ layout }: { layout: SlideLayout }) {
  const bar = "bg-current/25 rounded-[1px]";
  return (
    <span className="grid aspect-[16/10] w-full gap-[2px] p-1" aria-hidden="true">
      {layout === "title" ? <span className={cn(bar, "m-auto h-1/3 w-2/3")} /> : null}
      {layout === "section" ? <span className={cn(bar, "m-auto h-1/2 w-1/2")} /> : null}
      {layout === "content" ? (
        <span className="flex flex-col gap-[2px]">
          <span className={cn(bar, "h-1.5 w-2/3")} />
          <span className={cn(bar, "flex-1")} />
        </span>
      ) : null}
      {layout === "split" ? (
        <span className="grid grid-cols-2 gap-[2px]">
          <span className={bar} />
          <span className={bar} />
        </span>
      ) : null}
      {layout === "media" ? (
        <span className="flex flex-col gap-[2px]">
          <span className={cn(bar, "h-1 w-1/2")} />
          <span className={cn(bar, "flex-1")} />
        </span>
      ) : null}
      {layout === "canvas" ? <span className={cn(bar, "h-full w-full")} /> : null}
      {layout === "blank" ? <span className="h-full w-full rounded-[1px] border border-dashed border-current/25" /> : null}
    </span>
  );
}

export interface SlideInspectorProps {
  deck: DeckDocument;
  slide: DeckSlide;
  onSlide: (patch: Partial<Omit<DeckSlide, "id">>) => void;
  onDeck: (patch: Partial<Pick<DeckDocument, "theme" | "aspect" | "transition">>) => void;
}

/** Settings for the selected slide (layout, transition, click-by-click builds) and the deck. */
export function SlideInspector({ deck, slide, onSlide, onDeck }: SlideInspectorProps) {
  const blocks = buildableBlocks(slide);
  const builds = slide.builds ?? [];
  const stepOf = (id: string) => builds.findIndex((b) => b.blockId === id);
  return (
    <aside aria-label="Slide settings" className="flex w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l p-3 text-sm">
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">Layout</h2>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Layout">
          {SLIDE_LAYOUTS.filter((l) => l !== "canvas" || slide.layout === "canvas").map((layout) => (
            <button
              key={layout}
              type="button"
              role="radio"
              aria-checked={slide.layout === layout}
              title={LAYOUT_LABEL[layout]}
              disabled={slide.layout === "canvas" && layout !== "canvas"}
              onClick={() => onSlide({ layout })}
              className={cn(
                "text-muted-foreground flex flex-col items-center gap-1 rounded-md border p-1 text-2xs disabled:opacity-40",
                slide.layout === layout && "border-primary bg-accent text-foreground",
              )}
            >
              <LayoutIcon layout={layout} />
              <span className="truncate">{LAYOUT_LABEL[layout]}</span>
            </button>
          ))}
        </div>
        {slide.layout === "split" ? <p className="text-muted-foreground text-xs">Write on the left; put a block (quiz, app, video, diagram) on the right.</p> : null}
        {slide.layout === "canvas" ? <p className="text-muted-foreground text-xs">Shows the canvas as it was when the presentation was made, zoomed to one part.</p> : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">On each click</h2>
        {blocks.length === 0 ? (
          <p className="text-muted-foreground text-xs">Add text or blocks to the slide, then choose which appear one click at a time.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {blocks.map((block) => {
              const step = stepOf(block.id);
              const build = builds[step];
              return (
                <li key={block.id} className={cn("flex flex-col gap-1 rounded-md border p-2", step >= 0 && "border-primary/40 bg-accent/40")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-2xs font-semibold tabular-nums", step >= 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {step >= 0 ? step + 1 : "·"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs" title={describe(block)}>
                      {describe(block)}
                    </span>
                    <Switch
                      size="sm"
                      aria-label={`Reveal "${describe(block)}" on a click`}
                      checked={step >= 0}
                      onCheckedChange={(on) => onSlide({ builds: setBuild(slide, block.id, on ? "fade" : null) })}
                    />
                  </div>
                  {build ? (
                    <div className="flex items-center gap-1 pl-7">
                      <Select value={build.effect} onValueChange={(v) => onSlide({ builds: setBuild(slide, block.id, v as BuildEffect) })}>
                        <SelectTrigger size="sm" className="h-7 flex-1 text-xs" aria-label="Effect">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUILD_EFFECTS.map((e) => (
                            <SelectItem key={e} value={e}>
                              {EFFECT_LABEL[e]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="size-7 p-0" aria-label="Earlier" disabled={step === 0} onClick={() => onSlide({ builds: moveBuild(slide, block.id, -1) })}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-7 p-0" aria-label="Later" disabled={step === builds.length - 1} onClick={() => onSlide({ builds: moveBuild(slide, block.id, 1) })}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Label htmlFor="slide-transition" className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">
          Transition into this slide
        </Label>
        <Select value={slide.transition ?? "default"} onValueChange={(v) => onSlide({ transition: v === "default" ? undefined : (v as SlideTransition) })}>
          <SelectTrigger id="slide-transition" size="sm" className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Presentation default ({TRANSITION_LABEL[deck.transition].split(" (")[0]})</SelectItem>
            {SLIDE_TRANSITIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {TRANSITION_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between gap-2 text-xs">
          <Label htmlFor="slide-hidden">Skip when presenting</Label>
          <Switch id="slide-hidden" size="sm" checked={Boolean(slide.hidden)} onCheckedChange={(hidden) => onSlide({ hidden: hidden || undefined })} />
        </div>
      </section>

      <section className="mt-auto flex flex-col gap-2 border-t pt-4">
        <h2 className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">Presentation</h2>
        <Row label="Theme">
          <Select value={deck.theme} onValueChange={(v) => onDeck({ theme: v as DeckDocument["theme"] })}>
            <SelectTrigger size="sm" className="w-32 text-xs" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECK_THEMES.map((t) => (
                <SelectItem key={t} value={t}>
                  {THEME_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Shape">
          <Select value={deck.aspect} onValueChange={(v) => onDeck({ aspect: v as DeckDocument["aspect"] })}>
            <SelectTrigger size="sm" className="w-32 text-xs" aria-label="Slide shape">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECK_ASPECTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "16:9" ? "Wide (16:9)" : "Standard (4:3)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Transition">
          <Select value={deck.transition} onValueChange={(v) => onDeck({ transition: v as SlideTransition })}>
            <SelectTrigger size="sm" className="w-32 text-xs" aria-label="Default transition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_TRANSITIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TRANSITION_LABEL[t].split(" (")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </section>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      {children}
    </div>
  );
}
