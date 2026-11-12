"use client";

import "@octonote/widgets/styles.css";
import "@octonote/interactive/styles.css";
import "@octonote/motion/styles.css";
import { InteractiveProvider, InteractiveRenderer, Mcq, defaultComponents, type Question } from "@octonote/interactive";
import digestive from "@octonote/interactive/examples/digestive-system.json";
import practice from "@octonote/interactive/examples/water-cycle-practice.json";
import { ScenePlayer } from "@octonote/motion";
import circleArea from "@octonote/motion/examples/circle-area.json";
import { WidgetSpecRenderer, WidgetsProvider } from "@octonote/widgets";
import explorables from "@octonote/widgets/examples/explorables.json";
import { useEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

/** One tab per kind of block a note can hold. */
const TABS = [
  { id: "widget", label: "Widget", note: "Drag the blue numbers." },
  { id: "practice", label: "Practice", note: "Fill the blanks, order, sort, then check." },
  { id: "quiz", label: "Quiz", note: "Answer all, submit, review." },
  { id: "flashcards", label: "Flashcards", note: "Flip, then mark what you knew." },
  { id: "matching", label: "Matching", note: "Pair each organ with its job." },
  { id: "mindmap", label: "Mind map", note: "Try Test yourself, or Step through." },
  { id: "animation", label: "Animation", note: "Scrub, step or play." },
  { id: "simulation", label: "Simulation", note: "Run the experiment." },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** A widget written the way the AI writes them: a sentence with numbers to drag, and a chart that follows. */
const WIDGET = {
  schemaVersion: "1.0",
  type: "widget",
  id: "marketing-investing",
  title: "Compound interest",
  badge: "Finance",
  inputs: [
    { kind: "slider", id: "principal", label: "Amount invested", min: 100, max: 20000, step: 100, value: 1000, format: { style: "currency" } },
    { kind: "slider", id: "rate", label: "Annual return", min: 0, max: 15, step: 0.5, value: 7, format: { suffix: "%" } },
    { kind: "slider", id: "years", label: "Years", min: 1, max: 40, value: 20 },
  ],
  values: [
    { name: "balance", formula: "principal * (1 + rate/100)^years" },
    { name: "gain", formula: "balance - principal" },
  ],
  views: [
    { type: "sentence", text: "If you invest [principal] at [rate] a year for [years] years, you'll have **{balance|currency}**, and {gain|currency} of it is interest." },
    {
      type: "chart",
      chart: "area",
      x: { from: 0, to: 40, label: "Years" },
      xTo: "years",
      series: [
        { label: "Balance", y: "principal * (1 + rate/100)^x", color: "green" },
        { label: "Money you put in", y: "principal", color: "gray" },
      ],
      y: { format: { style: "currency" } },
    },
  ],
};

const QUESTIONS = (practice.questions as unknown as Question[]).filter((q) => q.id === "q-blank" || q.id === "q-order" || q.id === "q-groups");
const activity = (type: string) => (digestive.activities as unknown as { type: string }[]).find((a) => a.type === type);
const DICE = explorables.find((w) => w.id === "dice-six");

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
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
          <p className="text-foreground-strong text-2xl font-bold md:text-3xl">Study notes</p>
          <p className="text-muted-foreground mt-2 text-base md:text-lg">
            Every block below sits in a note like any paragraph.{" "}
            <span className="text-foreground">Try them.</span>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Kinds of interactive block">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id ? "bg-foreground text-background border-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setTouched(true);
                  setTab(t.id);
                }}
              >
                {t.label}
              </button>
            ))}
            <span className="text-muted-foreground ml-auto hidden text-sm sm:inline">{TABS.find((t) => t.id === tab)!.note}</span>
          </div>
          <div className="mt-4 min-h-[520px]" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
            {tab === "widget" ? (
              <WidgetsProvider theme={theme}>
                <WidgetSpecRenderer spec={WIDGET} />
              </WidgetsProvider>
            ) : null}
            {tab === "practice" ? (
              <InteractiveProvider components={defaultComponents} theme={theme}>
                <Mcq questions={QUESTIONS} title="The water cycle" description="Eight ways to answer a question; here are three." theme={theme} />
              </InteractiveProvider>
            ) : null}
            {tab === "quiz" || tab === "flashcards" || tab === "matching" || tab === "mindmap" ? (
              <InteractiveProvider components={defaultComponents} theme={theme}>
                <InteractiveRenderer key={tab} spec={activity(tab === "mindmap" ? "mindmap" : tab)} />
              </InteractiveProvider>
            ) : null}
            {tab === "animation" ? <ScenePlayer spec={circleArea} theme={theme} autoPlay={inView} loop allowDownload={false} /> : null}
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
