"use client";

import "@octonote/widgets/styles.css";
import "@octonote/interactive/styles.css";
import "@octonote/motion/styles.css";
import { InteractiveProvider, InteractiveRenderer, defaultComponents } from "@octonote/interactive";
import digestive from "@octonote/interactive/examples/digestive-system.json";
import { ScenePlayer } from "@octonote/motion";
import circleArea from "@octonote/motion/examples/circle-area.json";
import { Infographic, WidgetSpecRenderer, WidgetsProvider, type InfographicSpec } from "@octonote/widgets";
import infographics from "@octonote/widgets/examples/infographics.json";
import explorables from "@octonote/widgets/examples/explorables.json";
import { ArrowLeftRight, ChartColumnBig, CircleHelp, Clapperboard, Dices, Layers, Network, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

/** One tab per kind of block a note can hold. */
const TABS = [
  { id: "widget", label: "Widget", icon: SlidersHorizontal, note: "Drag the point around the circle." },
  { id: "animation", label: "Animation", icon: Clapperboard, note: "Scrub, step or play." },
  { id: "simulation", label: "Simulation", icon: Dices, note: "Run the experiment." },
  { id: "mindmap", label: "Mind map", icon: Network, note: "Try Test yourself, or Step through." },
  { id: "flashcards", label: "Flashcards", icon: Layers, note: "Flip, then mark what you knew." },
  { id: "quiz", label: "Quiz", icon: CircleHelp, note: "Answer all, submit, review." },
  { id: "matching", label: "Matching", icon: ArrowLeftRight, note: "Pair each organ with its job." },
  { id: "infographic", label: "Infographic", icon: ChartColumnBig, note: "Click any step to open it." },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; note: string }[];

type Tab = (typeof TABS)[number]["id"];

const activity = (type: string) => (digestive.activities as unknown as { type: string }[]).find((a) => a.type === type);
const VACCINE = infographics.find((g) => g.id === "how-vaccines-work") as unknown as InfographicSpec;
const DICE = explorables.find((w) => w.id === "dice-six");
/** A point to drag around the unit circle, with sine and cosine following it. */
const CIRCLE = explorables.find((w) => w.id === "unit-circle");

/**
 * The real interactive blocks from Octonote notes, live: the same libraries
 * the editor uses. Tabs move on by themselves until the visitor touches the
 * demo, then it's theirs to play with.
 */
export function InteractiveDemo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [tab, setTab] = useState<Tab>("widget");
  const [touched, setTouched] = useState(false);
  const dark = useIsDark();
  const theme = dark ? "dark" : "light";
  const reduced = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);

  // Show each kind of block in turn while it's on screen and untouched.
  useEffect(() => {
    if (touched || !inView || reduced) return;
    const id = setTimeout(() => setTab((t) => TABS[(TABS.findIndex((x) => x.id === t) + 1) % TABS.length]!.id), 7000);
    return () => clearTimeout(id);
  }, [tab, touched, inView, reduced]);

  return (
    <div ref={ref}>
      <div
        ref={frame}
        className="bg-card text-card-foreground relative overflow-hidden rounded-2xl border text-left shadow-lg"
        onPointerDown={() => setTouched(true)}
        onKeyDown={() => setTouched(true)}
      >
        <div className="flex h-11 items-center gap-2 border-b px-4" aria-hidden>
          <span className="flex gap-1.5">
            <span className="bg-window-close size-3 rounded-full" />
            <span className="bg-window-minimize size-3 rounded-full" />
            <span className="bg-window-zoom size-3 rounded-full" />
          </span>
          <span className="text-muted-foreground ml-3 truncate text-sm">Study notes · Octonote</span>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <p className="text-foreground-strong text-2xl font-bold md:text-3xl">Study notes</p>
          <p className="text-muted-foreground mt-2 text-base md:text-lg">
            Every block below sits in a note like any paragraph.{" "}
            <span className="text-foreground">Try them.</span>
          </p>
          <div
            className="-mx-4 mt-5 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Kinds of interactive block"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  tab === t.id ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setTouched(true);
                  setTab(t.id);
                }}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-sm">{TABS.find((t) => t.id === tab)!.note}</p>
          <div className="mt-4 min-h-[520px]" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
            {tab === "widget" ? (
              <WidgetsProvider theme={theme}>
                <WidgetSpecRenderer spec={CIRCLE} />
              </WidgetsProvider>
            ) : null}
            {tab === "quiz" || tab === "flashcards" || tab === "matching" || tab === "mindmap" ? (
              <InteractiveProvider components={defaultComponents} theme={theme}>
                <InteractiveRenderer key={tab} spec={activity(tab === "mindmap" ? "mindmap" : tab)} />
              </InteractiveProvider>
            ) : null}
            {tab === "animation" ? <ScenePlayer spec={circleArea} theme={theme} autoPlay={inView} loop allowDownload={false} /> : null}
            {tab === "infographic" ? (
              <WidgetsProvider theme={theme}>
                <Infographic spec={VACCINE} />
              </WidgetsProvider>
            ) : null}
            {tab === "simulation" ? (
              <WidgetsProvider theme={theme}>
                <WidgetSpecRenderer spec={DICE} />
              </WidgetsProvider>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
