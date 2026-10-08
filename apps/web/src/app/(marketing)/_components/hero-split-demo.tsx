"use client";

import { FileText, LayoutGrid, Columns2 } from "lucide-react";
import { useEffect, useState } from "react";

interface CanvasNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface CanvasEdge {
  from: string;
  to: string;
  label?: string;
}

const NODE_W = 100;
const NODE_H = 38;

const CANVAS_NODES: CanvasNode[] = [
  { id: "client", label: "Client", x: 20, y: 110 },
  { id: "server", label: "Server", x: 170, y: 110 },
  { id: "db", label: "Database", x: 330, y: 60 },
  { id: "cache", label: "Cache", x: 330, y: 165 },
];

const CANVAS_EDGES: CanvasEdge[] = [
  { from: "client", to: "server", label: "HTTP" },
  { from: "server", to: "db", label: "SQL" },
  { from: "server", to: "cache", label: "read" },
];

interface NoteBlock {
  kind: "h1" | "h2" | "p" | "bullet";
  text: string;
}

const NOTE_BLOCKS: NoteBlock[] = [
  { kind: "h1", text: "Architecture" },
  { kind: "p", text: "Map how the parts talk to each other." },
  { kind: "h2", text: "Flow" },
  { kind: "bullet", text: "Client > Server: HTTP" },
  { kind: "bullet", text: "Server > Database: SQL" },
  { kind: "bullet", text: "Server > Cache: read" },
];

const TIMELINE: Array<{ notes: number; nodes: number; edges: number }> = [
  { notes: 0, nodes: 0, edges: 0 },
  { notes: 1, nodes: 0, edges: 0 },
  { notes: 2, nodes: 0, edges: 0 },
  { notes: 3, nodes: 0, edges: 0 },
  { notes: 4, nodes: 2, edges: 1 },
  { notes: 5, nodes: 3, edges: 2 },
  { notes: 6, nodes: 4, edges: 3 },
];

const STEP_MS = 1100;
const HOLD_MS = 3000;

type Mode = "notes" | "both" | "canvas";

export function HeroSplitDemo() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("both");

  useEffect(() => {
    const last = TIMELINE.length - 1;
    const delay = step === last ? HOLD_MS : STEP_MS;
    const id = setTimeout(() => {
      setStep((s) => (s + 1) % TIMELINE.length);
    }, delay);
    return () => clearTimeout(id);
  }, [step]);

  const counts = TIMELINE[step]!;
  const showNotes = mode === "notes" || mode === "both";
  const showCanvas = mode === "canvas" || mode === "both";

  return (
    <div className="bg-card overflow-hidden rounded-2xl border text-left shadow-lg">
      {/* Project view toolbar */}
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2 text-left">
          <span
            className="bg-foreground/50 inline-block size-1.5 rounded-full"
            aria-hidden
          />
          <span className="text-foreground-strong text-sm font-semibold leading-tight">
            Architecture
          </span>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="w-16" aria-hidden />
      </header>

      {/* Split: Notes | Canvas — height locked so toggling modes doesn't resize the card */}
      <div
        className={`grid h-[520px] sm:h-[480px] ${
          showNotes && showCanvas ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {showNotes && (
          <div
            className={`flex flex-col overflow-hidden ${
              showCanvas ? "border-border/60 border-b sm:border-r sm:border-b-0" : ""
            }`}
          >
            <div className="text-muted-foreground flex h-11 shrink-0 items-center gap-2 border-b px-6 text-xs font-medium tracking-wider uppercase">
              <FileText className="size-3.5" />
              Notes
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-auto px-8 py-7 text-left">
              {NOTE_BLOCKS.map((block, i) => (
                <NoteBlockView
                  key={i}
                  block={block}
                  visible={i < counts.notes}
                  isLatest={i === counts.notes - 1}
                />
              ))}
            </div>
          </div>
        )}
        {showCanvas && (
          <div className="flex flex-col overflow-hidden">
            <div className="text-muted-foreground flex h-11 shrink-0 items-center gap-2 border-b px-6 text-xs font-medium tracking-wider uppercase">
              <LayoutGrid className="size-3.5" />
              Canvas
            </div>
            <div className="grid flex-1 place-items-center overflow-auto p-6">
              <CanvasMock visibleNodes={counts.nodes} visibleEdges={counts.edges} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="bg-background inline-flex items-center gap-0.5 rounded-md border p-0.5 text-xs">
      <ModeButton
        Icon={FileText}
        label="Notes"
        active={mode === "notes"}
        onClick={() => onChange("notes")}
      />
      <ModeButton
        Icon={Columns2}
        label="Both"
        active={mode === "both"}
        onClick={() => onChange("both")}
      />
      <ModeButton
        Icon={LayoutGrid}
        label="Canvas"
        active={mode === "canvas"}
        onClick={() => onChange("canvas")}
      />
    </div>
  );
}

function ModeButton({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: typeof FileText;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
      aria-pressed={active}
    >
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function NoteBlockView({
  block,
  visible,
  isLatest,
}: {
  block: NoteBlock;
  visible: boolean;
  isLatest: boolean;
}) {
  const base =
    "transition-all duration-500 " +
    (visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0");

  if (block.kind === "h1") {
    return (
      <h3 className={`text-foreground-strong text-2xl font-bold tracking-tight ${base}`}>
        {block.text}
        {isLatest && <Caret />}
      </h3>
    );
  }
  if (block.kind === "h2") {
    return (
      <h4 className={`text-foreground-strong text-lg font-semibold ${base}`}>
        {block.text}
        {isLatest && <Caret />}
      </h4>
    );
  }
  if (block.kind === "p") {
    return (
      <p className={`text-muted-foreground text-base ${base}`}>
        {block.text}
        {isLatest && <Caret />}
      </p>
    );
  }
  return (
    <div className={`text-foreground flex gap-2 text-base ${base}`}>
      <span className="text-muted-foreground">•</span>
      <span className="font-mono">{block.text}</span>
      {isLatest && <Caret />}
    </div>
  );
}

function Caret() {
  return (
    <span className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" />
  );
}

function CanvasMock({
  visibleNodes,
  visibleEdges,
}: {
  visibleNodes: number;
  visibleEdges: number;
}) {
  const idToNode = new Map(CANVAS_NODES.map((n) => [n.id, n]));
  const width = 460;
  const height = 230;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-full max-h-full w-full max-w-full"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      style={{ color: "var(--foreground)" }}
    >
      <defs>
        <marker
          id="octo-hero-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {CANVAS_EDGES.map((edge, i) => {
        const from = idToNode.get(edge.from);
        const to = idToNode.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + NODE_W;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y + NODE_H / 2;
        const visible = i < visibleEdges;
        return (
          <g
            key={`${edge.from}-${edge.to}`}
            className="transition-opacity duration-500"
            style={{ opacity: visible ? 1 : 0 }}
          >
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={1.25}
              markerEnd="url(#octo-hero-arrow)"
              opacity={0.7}
            />
            {edge.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 5}
                textAnchor="middle"
                fontSize={9}
                fill="currentColor"
                opacity={0.55}
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {CANVAS_NODES.map((node, i) => {
        const visible = i < visibleNodes;
        return (
          <g
            key={node.id}
            className="transition-all duration-500"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "scale(1)" : "scale(0.85)",
              transformOrigin: `${node.x + NODE_W / 2}px ${node.y + NODE_H / 2}px`,
            }}
          >
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill="var(--card)"
              stroke="currentColor"
              strokeWidth={1.1}
              opacity={0.95}
            />
            <text
              x={node.x + NODE_W / 2}
              y={node.y + NODE_H / 2 + 3}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              fill="currentColor"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
