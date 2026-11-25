"use client";

import {
  ANIMATION_EFFECTS,
  ANIMATION_TRIGGERS,
  ANIMATION_TYPES,
  blockText,
  DECK_ASPECTS,
  DECK_THEMES,
  SHAPES,
  SLIDE_SIZE,
  SLIDE_TRANSITIONS,
  slideTimeline,
  type AlignEdge,
  type AnimationType,
  type DeckDocument,
  type DeckSlide,
  type ElementStyle,
  type LayerMove,
  type SlideAnimation,
  type SlideElement,
  type SlideTransition,
} from "@octonote/slides";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowUp,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Group,
  ListOrdered,
  Lock,
  Play,
  SendToBack,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INTERACTIVE_LABELS } from "@/features/notes/blocks/interactive-block";
import { cn } from "@/lib/utils";
import { ANIMATION_TYPE_LABEL, EFFECT_LABEL, SHAPE_LABEL, THEME_LABEL, TRANSITION_LABEL, TRIGGER_LABEL } from "../lib/labels";

export type InspectorTab = "arrange" | "style" | "animate" | "slide";

export interface InspectorActions {
  patchElements: (ids: string[], change: (e: SlideElement) => SlideElement, force?: boolean) => void;
  align: (edge: AlignEdge) => void;
  distribute: (axis: "horizontal" | "vertical") => void;
  layer: (move: LayerMove) => void;
  group: () => void;
  ungroup: () => void;
  duplicate: () => void;
  remove: () => void;
  addAnimation: (type: AnimationType, effect: string) => void;
  animateParagraphs: (elementId: string) => void;
  updateAnimation: (id: string, patch: Partial<SlideAnimation>) => void;
  removeAnimation: (id: string) => void;
  moveAnimation: (id: string, to: number) => void;
  selectElement: (id: string) => void;
  preview: () => void;
  patchSlide: (patch: Partial<Omit<DeckSlide, "id">>) => void;
  patchDeck: (patch: Partial<Pick<DeckDocument, "theme" | "aspect" | "transition">>) => void;
}

/** What an object is called in lists: its name, a title's text, or its kind. */
export function describeElement(e: SlideElement): string {
  if (e.name) return e.name;
  if (e.kind === "text") {
    const t = e.blocks.map((b) => blockText(b).trim()).find(Boolean);
    return t ? (t.length > 32 ? `${t.slice(0, 31)}…` : t) : "Text";
  }
  if (e.kind === "block") {
    const b = e.blocks[0];
    if (b?.type === "interactive") return INTERACTIVE_LABELS[b.props?.kind] ?? "Block";
    return ({ manimVideo: "Video", mermaid: "Diagram", mathBlock: "Equation", codeBlock: "Code", table: "Table", figure: "Figure", image: "Picture" } as Record<string, string>)[b?.type ?? ""] ?? "Block";
  }
  if (e.kind === "shape") return SHAPE_LABEL[e.shape];
  return e.kind === "image" ? "Picture" : "Canvas";
}

const SWATCHES: { value: string | undefined; label: string; css: string }[] = [
  { value: undefined, label: "None", css: "transparent" },
  { value: "bg", label: "Background", css: "var(--background)" },
  { value: "surface", label: "Surface", css: "var(--muted)" },
  { value: "accent", label: "Accent", css: "#2f6feb" },
  { value: "fg", label: "Text", css: "var(--foreground)" },
  { value: "#e5484d", label: "Red", css: "#e5484d" },
  { value: "#f5a524", label: "Amber", css: "#f5a524" },
  { value: "#2e9e5b", label: "Green", css: "#2e9e5b" },
  { value: "#7c5cff", label: "Purple", css: "#7c5cff" },
];

function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-2xs">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {SWATCHES.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.label}
            aria-label={`${label}: ${s.label}`}
            aria-pressed={value === s.value}
            onClick={() => onChange(s.value)}
            className={cn("size-5 rounded-full border", value === s.value && "ring-primary ring-2 ring-offset-1", s.value === undefined && "bg-[linear-gradient(45deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)]")}
            style={s.value === undefined ? undefined : { background: s.css }}
          />
        ))}
        <input
          type="color"
          aria-label={`${label}: custom colour`}
          value={value && value.startsWith("#") && value.length === 7 ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-2xs">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <Input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="h-7 px-2 text-xs tabular-nums"
      />
    </label>
  );
}

function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" className="size-8 p-0" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-muted-foreground text-2xs font-semibold tracking-wider uppercase">{title}</h3>
    {children}
  </section>
);

function ArrangePanel({ deck, picked, act }: { deck: DeckDocument; picked: SlideElement[]; act: InspectorActions }) {
  if (!picked.length) return <p className="text-muted-foreground text-xs">Select an object on the slide to place it exactly, line it up with others or change its layer.</p>;
  const one = picked.length === 1 ? picked[0]! : null;
  const ids = picked.map((e) => e.id);
  const locked = picked.every((e) => e.lock);
  const set = (patch: Partial<SlideElement>) => act.patchElements(ids, (e) => ({ ...e, ...patch }) as SlideElement);
  const grouped = picked.some((e) => e.groupId);
  return (
    <div className="flex flex-col gap-5">
      {one ? (
        <Section title="Position and size">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={one.x} onChange={(x) => set({ x })} />
            <NumberField label="Y" value={one.y} onChange={(y) => set({ y })} />
            <NumberField label="Width" value={one.w} min={12} onChange={(w) => set({ w: Math.max(12, w) })} />
            <NumberField label="Height" value={one.h} min={12} onChange={(h) => set({ h: Math.max(12, h) })} />
            <NumberField label="Rotation" suffix="°" value={one.rotate ?? 0} onChange={(r) => set({ rotate: ((r % 360) + 360) % 360 || undefined })} />
          </div>
          <span className="text-muted-foreground text-2xs">
            The slide is {SLIDE_SIZE[deck.aspect].w} × {SLIDE_SIZE[deck.aspect].h}.
          </span>
        </Section>
      ) : null}
      <Section title={picked.length > 1 ? "Align to each other" : "Align to the slide"}>
        <div className="flex flex-wrap gap-0.5">
          <IconButton label="Align left" onClick={() => act.align("left")}><AlignStartVertical className="size-4" /></IconButton>
          <IconButton label="Align centre" onClick={() => act.align("center")}><AlignCenterVertical className="size-4" /></IconButton>
          <IconButton label="Align right" onClick={() => act.align("right")}><AlignEndVertical className="size-4" /></IconButton>
          <IconButton label="Align top" onClick={() => act.align("top")}><AlignStartHorizontal className="size-4" /></IconButton>
          <IconButton label="Align middle" onClick={() => act.align("middle")}><AlignCenterHorizontal className="size-4" /></IconButton>
          <IconButton label="Align bottom" onClick={() => act.align("bottom")}><AlignEndHorizontal className="size-4" /></IconButton>
          <IconButton label="Distribute horizontally" onClick={() => act.distribute("horizontal")} disabled={picked.length < 3}><AlignHorizontalSpaceAround className="size-4" /></IconButton>
          <IconButton label="Distribute vertically" onClick={() => act.distribute("vertical")} disabled={picked.length < 3}><AlignVerticalSpaceAround className="size-4" /></IconButton>
        </div>
      </Section>
      <Section title="Layer">
        <div className="flex flex-wrap gap-0.5">
          <IconButton label="Bring to front" onClick={() => act.layer("front")}><BringToFront className="size-4" /></IconButton>
          <IconButton label="Bring forward" onClick={() => act.layer("forward")}><ChevronsUp className="size-4" /></IconButton>
          <IconButton label="Send backward" onClick={() => act.layer("backward")}><ChevronsDown className="size-4" /></IconButton>
          <IconButton label="Send to back" onClick={() => act.layer("back")}><SendToBack className="size-4" /></IconButton>
          {picked.length > 1 && !grouped ? <IconButton label="Group" onClick={act.group}><Group className="size-4" /></IconButton> : null}
          {grouped ? <IconButton label="Ungroup" onClick={act.ungroup}><Ungroup className="size-4" /></IconButton> : null}
          <IconButton label={locked ? "Unlock" : "Lock (can't be moved or resized)"} onClick={() => act.patchElements(ids, (e) => ({ ...e, lock: locked ? undefined : true }), true)}>
            {locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
          </IconButton>
          <IconButton label="Duplicate" onClick={act.duplicate}><Copy className="size-4" /></IconButton>
          <IconButton label="Delete" onClick={act.remove}><Trash2 className="size-4" /></IconButton>
        </div>
      </Section>
      {one ? (
        <Section title="Name">
          <Input
            value={one.name ?? ""}
            placeholder={describeElement({ ...one, name: undefined })}
            onChange={(e) => act.patchElements([one.id], (x) => ({ ...x, name: e.target.value || undefined }), true)}
            className="h-7 text-xs"
          />
        </Section>
      ) : null}
    </div>
  );
}

function StylePanel({ picked, act }: { picked: SlideElement[]; act: InspectorActions }) {
  if (!picked.length) return <p className="text-muted-foreground text-xs">Select an object to change its fill, border, corners or text.</p>;
  const ids = picked.map((e) => e.id);
  const first = picked[0]!;
  const style = first.style ?? {};
  const setStyle = (patch: Partial<ElementStyle>) =>
    act.patchElements(ids, (e) => {
      const next = { ...(e.style ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof ElementStyle)[]) if (next[k] === undefined) delete next[k];
      return { ...e, style: Object.keys(next).length ? next : undefined } as SlideElement;
    });
  const hasText = picked.some((e) => e.kind === "text" || e.kind === "block");
  const shapes = picked.filter((e) => e.kind === "shape");
  return (
    <div className="flex flex-col gap-5">
      {shapes.length ? (
        <Section title="Shape">
          <Select value={shapes[0]!.kind === "shape" ? shapes[0]!.shape : "rect"} onValueChange={(v) => act.patchElements(shapes.map((s) => s.id), (e) => ({ ...e, shape: v }) as SlideElement)}>
            <SelectTrigger size="sm" className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHAPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SHAPE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      ) : null}
      {hasText ? (
        <Section title="Text">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground text-2xs">Size ({Math.round((style.fontScale ?? 1) * 100)}%)</span>
            <input type="range" min={0.5} max={3} step={0.05} value={style.fontScale ?? 1} onChange={(e) => setStyle({ fontScale: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} aria-label="Text size" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={style.textAlign ?? "left"} onValueChange={(v) => setStyle({ textAlign: v === "left" ? undefined : (v as ElementStyle["textAlign"]) })}>
              <SelectTrigger size="sm" className="text-xs" aria-label="Horizontal alignment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Centre</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
            <Select value={style.vAlign ?? "top"} onValueChange={(v) => setStyle({ vAlign: v === "top" ? undefined : (v as ElementStyle["vAlign"]) })}>
              <SelectTrigger size="sm" className="text-xs" aria-label="Vertical alignment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
                <SelectItem value="bottom">Bottom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumberField label="Padding" value={style.padding ?? 0} min={0} onChange={(padding) => setStyle({ padding: padding || undefined })} />
        </Section>
      ) : null}
      <Section title="Fill and border">
        <ColorField label="Fill" value={style.fill} onChange={(fill) => setStyle({ fill })} />
        <ColorField label="Border" value={style.stroke} onChange={(stroke) => setStyle({ stroke })} />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Border width" value={style.strokeWidth ?? (style.stroke ? 1 : 0)} min={0} onChange={(strokeWidth) => setStyle({ strokeWidth })} />
          <NumberField label="Corners" value={style.radius ?? 0} min={0} onChange={(radius) => setStyle({ radius: radius || undefined })} />
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground text-2xs">Opacity ({Math.round((style.opacity ?? 1) * 100)}%)</span>
          <input type="range" min={0.05} max={1} step={0.05} value={style.opacity ?? 1} onChange={(e) => setStyle({ opacity: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} aria-label="Opacity" />
        </label>
      </Section>
    </div>
  );
}

function AnimatePanel({ slide, picked, act }: { slide: DeckSlide; picked: SlideElement[]; act: InspectorActions }) {
  const one = picked.length === 1 ? picked[0]! : null;
  const steps = slideTimeline(slide);
  const stepOf = new Map<string, number>();
  steps.forEach((step, i) => step.forEach((t) => stepOf.set(t.animation.id, i)));
  const byId = new Map(slide.elements.map((e) => [e.id, e]));
  const paragraphText = (a: SlideAnimation) => {
    const el = byId.get(a.elementId);
    const block = el && "blocks" in el ? el.blocks.find((b) => b.id === a.blockId) : undefined;
    return block ? blockText(block).trim().slice(0, 24) : "";
  };
  return (
    <div className="flex flex-col gap-5">
      <Section title={one ? `Add an effect to “${describeElement(one)}”` : "Add an effect"}>
        {one ? (
          <>
            <div className="grid grid-cols-3 gap-1">
              {ANIMATION_TYPES.map((type) => (
                <Select key={type} value="" onValueChange={(effect) => act.addAnimation(type, effect)}>
                  <SelectTrigger size="sm" className="text-xs" aria-label={`Add ${ANIMATION_TYPE_LABEL[type].toLowerCase()} effect`}>
                    <SelectValue placeholder={ANIMATION_TYPE_LABEL[type]} />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_EFFECTS[type].map((effect) => (
                      <SelectItem key={effect} value={effect}>
                        {EFFECT_LABEL[effect] ?? effect}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
            {one.kind === "text" && one.blocks.length > 1 ? (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => act.animateParagraphs(one.id)}>
                <ListOrdered className="size-3.5" /> One point per click
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-xs">Select one object on the slide to give it an entrance, emphasis or exit.</p>
        )}
      </Section>
      <Section title="This slide's timeline">
        {slide.animations.length === 0 ? (
          <p className="text-muted-foreground text-xs">No effects yet. Everything shows as soon as the slide does.</p>
        ) : (
          <>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={act.preview}>
              <Play className="size-3.5" /> Preview the slide
            </Button>
            <ol className="flex flex-col gap-1.5">
              {slide.animations.map((a, i) => {
                const el = byId.get(a.elementId);
                const step = stepOf.get(a.id) ?? 0;
                const target = el ? `${describeElement(el)}${a.blockId ? ` · ${paragraphText(a)}` : ""}` : "?";
                const focused = picked.some((p) => p.id === a.elementId);
                return (
                  <li key={a.id} className={cn("flex flex-col gap-1.5 rounded-md border p-2", focused && "border-primary/50 bg-accent/40")}>
                    <div className="flex items-center gap-2">
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-2xs font-semibold tabular-nums", step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} title={step ? `Click ${step}` : "Plays when the slide appears"}>
                        {step || "▸"}
                      </span>
                      <button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" onClick={() => act.selectElement(a.elementId)} title={target}>
                        <span className="text-muted-foreground">{ANIMATION_TYPE_LABEL[a.type]} · </span>
                        {target}
                      </button>
                      <Button variant="ghost" size="sm" className="size-6 p-0" aria-label="Earlier" disabled={i === 0} onClick={() => act.moveAnimation(a.id, i - 1)}>
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-6 p-0" aria-label="Later" disabled={i === slide.animations.length - 1} onClick={() => act.moveAnimation(a.id, i + 1)}>
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-6 p-0" aria-label="Remove effect" onClick={() => act.removeAnimation(a.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Select
                        value={a.effect}
                        // Effect names are unique across entrance, emphasis and exit: picking one sets its kind too.
                        onValueChange={(effect) => act.updateAnimation(a.id, { effect, type: ANIMATION_TYPES.find((t) => ANIMATION_EFFECTS[t].includes(effect)) ?? a.type })}
                      >
                        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Effect">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANIMATION_TYPES.map((type) =>
                            ANIMATION_EFFECTS[type].map((effect) => (
                              <SelectItem key={`${type}:${effect}`} value={effect}>
                                {EFFECT_LABEL[effect] ?? effect}
                              </SelectItem>
                            )),
                          )}
                        </SelectContent>
                      </Select>
                      <Select value={a.trigger} onValueChange={(trigger) => act.updateAnimation(a.id, { trigger: trigger as SlideAnimation["trigger"] })}>
                        <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Starts">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANIMATION_TRIGGERS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {TRIGGER_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <NumberField label="Duration" suffix="s" step={0.1} min={0} value={a.duration / 1000} onChange={(s) => act.updateAnimation(a.id, { duration: Math.max(0, Math.round(s * 1000)) })} />
                      <NumberField label="Delay" suffix="s" step={0.1} min={0} value={a.delay / 1000} onChange={(s) => act.updateAnimation(a.id, { delay: Math.max(0, Math.round(s * 1000)) })} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Section>
    </div>
  );
}

function SlidePanel({ deck, slide, act }: { deck: DeckDocument; slide: DeckSlide; act: InspectorActions }) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="This slide">
        <ColorField label="Background" value={slide.background} onChange={(background) => act.patchSlide({ background })} />
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-2xs">Transition into this slide</span>
          <Select value={slide.transition ?? "default"} onValueChange={(v) => act.patchSlide({ transition: v === "default" ? undefined : (v as SlideTransition) })}>
            <SelectTrigger size="sm" className="text-xs">
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
        </label>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span>Skip when presenting</span>
          <Switch size="sm" checked={Boolean(slide.hidden)} onCheckedChange={(hidden) => act.patchSlide({ hidden: hidden || undefined })} aria-label="Skip when presenting" />
        </div>
      </Section>
      <Section title="Presentation">
        <Row label="Theme">
          <Select value={deck.theme} onValueChange={(v) => act.patchDeck({ theme: v as DeckDocument["theme"] })}>
            <SelectTrigger size="sm" className="w-36 text-xs" aria-label="Theme">
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
          <Select value={deck.aspect} onValueChange={(v) => act.patchDeck({ aspect: v as DeckDocument["aspect"] })}>
            <SelectTrigger size="sm" className="w-36 text-xs" aria-label="Slide shape">
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
          <Select value={deck.transition} onValueChange={(v) => act.patchDeck({ transition: v as SlideTransition })}>
            <SelectTrigger size="sm" className="w-36 text-xs" aria-label="Default transition">
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
      </Section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Inspector({
  deck,
  slide,
  picked,
  tab,
  onTab,
  act,
}: {
  deck: DeckDocument;
  slide: DeckSlide;
  picked: SlideElement[];
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  act: InspectorActions;
}) {
  return (
    <aside aria-label="Inspector" className="flex w-72 shrink-0 flex-col border-l">
      <Tabs value={tab} onValueChange={(v) => onTab(v as InspectorTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="m-2 grid grid-cols-4">
          <TabsTrigger value="arrange" className="text-xs">Arrange</TabsTrigger>
          <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
          <TabsTrigger value="animate" className="text-xs">Animate</TabsTrigger>
          <TabsTrigger value="slide" className="text-xs">Slide</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 text-sm">
          <TabsContent value="arrange"><ArrangePanel deck={deck} picked={picked} act={act} /></TabsContent>
          <TabsContent value="style"><StylePanel picked={picked} act={act} /></TabsContent>
          <TabsContent value="animate"><AnimatePanel slide={slide} picked={picked} act={act} /></TabsContent>
          <TabsContent value="slide"><SlidePanel deck={deck} slide={slide} act={act} /></TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
