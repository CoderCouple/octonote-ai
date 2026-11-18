import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { LIMITS, type MindmapNode } from "../core/index.js";
import { useControllableState } from "../react/index.js";
import { downloadPng, downloadSvg, mindmapSvg, readColors, BRANCH_COUNT } from "./mindmap-export.js";
import { collapseAll, defaultCollapsed, edgeEnds, edgePath, layoutMindmap, type Direction, type PlacedNode } from "./mindmap-layout.js";
import { ActivityFrame, cx, hasModifier, isTyping, LiveRegion, useActivity, type ActivityProps } from "./ui.js";

export interface MindmapState {
  collapsed: Record<string, boolean>;
  /** Labels the learner has edited. */
  labels: Record<string, string>;
  /** How far the learner dragged each node (and with it, its branch). */
  offsets: Record<string, { x: number; y: number }>;
  /** Nodes the learner has had on screen; the map is complete once all have been. */
  seen: Record<string, true>;
  completed: boolean;
  /** Test-yourself mode: topics stay hidden until the learner reveals them. */
  recall?: { revealed: Record<string, true> };
  /** Stepping through: branches open one at a time. */
  stepping?: boolean;
}

export interface MindmapNodeRenderInfo {
  node: MindmapNode;
  label: string;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  selected: boolean;
}

export interface MindmapProps extends ActivityProps<MindmapState> {
  nodes: readonly MindmapNode[];
  title?: string;
  description?: string;
  /** Let the learner rename nodes (double-click or F2). */
  editable?: boolean;
  /** Let the learner drag nodes. Defaults to true. */
  draggable?: boolean;
  /** Height of the map area in pixels. Defaults to 480. */
  height?: number;
  /** "both" puts branches either side of the central topic; "right" grows them all to the right. */
  direction?: Direction;
  /** Replaces the label inside each node. */
  renderNode?: (info: MindmapNodeRenderInfo) => ReactNode;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

const usable = (state: MindmapState | undefined): state is MindmapState =>
  !!state && typeof state.collapsed === "object" && typeof state.labels === "object" && typeof state.offsets === "object" && typeof state.seen === "object";

/** Headless mind map state: expanding, renaming and moving nodes. */
export function useMindmap(props: MindmapProps, direction: Direction | undefined = props.direction) {
  const { nodes } = props;
  const { id, emit } = useActivity("mindmap", props);
  const [state, setState] = useControllableState<MindmapState>(
    usable(props.state) ? props.state : undefined,
    () => (usable(props.defaultState) ? props.defaultState : { collapsed: defaultCollapsed(nodes), labels: {}, offsets: {}, seen: {}, completed: false }),
    props.onStateChange,
  );
  const layout = useMemo(() => layoutMindmap(nodes, state.collapsed, { labels: state.labels, direction }), [nodes, state.collapsed, state.labels, direction]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Count newly visible nodes as seen; finishing the map means seeing every node.
  useEffect(() => {
    const unseen = layout.nodes.filter((p) => !state.seen[p.node.id]);
    if (!unseen.length) return;
    const seen = { ...state.seen };
    unseen.forEach((p) => (seen[p.node.id] = true));
    // Only count nodes still in the map, so an edited spec can't finish it early.
    const completed = state.completed || nodes.every((n) => seen[n.id]);
    setState((s) => ({ ...s, seen, completed }));
    if (completed && !state.completed) emit({ type: "activity.completed" });
  }, [layout, state.seen, state.completed, nodes, setState, emit]);

  // Test yourself is finished once every topic but the centre is revealed.
  const recallDone = !!state.recall && nodes.every((n) => n.parent === undefined || state.recall!.revealed[n.id]);
  useEffect(() => {
    if (recallDone) emit({ type: "activity.completed" });
  }, [recallDone, emit]);

  return {
    id,
    state,
    layout,
    byId,
    labelOf: (nodeId: string) => state.labels[nodeId] ?? byId.get(nodeId)?.label ?? "",
    setExpanded(nodeId: string, expanded: boolean) {
      if (!!state.collapsed[nodeId] === !expanded) return;
      setState((s) => ({ ...s, collapsed: { ...s.collapsed, [nodeId]: !expanded } }));
      emit({ type: "node.toggled", nodeId, expanded });
    },
    rename(nodeId: string, label: string) {
      const clean = label.trim().slice(0, LIMITS.titleLength);
      if (!clean || clean === (state.labels[nodeId] ?? byId.get(nodeId)?.label)) return;
      setState((s) => ({ ...s, labels: { ...s.labels, [nodeId]: clean } }));
      emit({ type: "node.edited", nodeId, label: clean });
    },
    move(nodeId: string, dx: number, dy: number) {
      setState((s) => {
        const old = s.offsets[nodeId] ?? { x: 0, y: 0 };
        return { ...s, offsets: { ...s.offsets, [nodeId]: { x: old.x + dx, y: old.y + dy } } };
      });
    },
    expandAll: () => setState((s) => ({ ...s, collapsed: {}, stepping: false })),
    collapseAll: () => setState((s) => ({ ...s, collapsed: collapseAll(nodes), stepping: false })),
    /** Hide every topic but the centre; the learner recalls each before revealing it. */
    startRecall() {
      setState((s) => ({ ...s, collapsed: {}, recall: { revealed: {} } }));
      emit({ type: "activity.started" });
    },
    stopRecall: () => setState((s) => ({ ...s, recall: undefined })),
    isHidden: (nodeId: string) => !!state.recall && !state.recall.revealed[nodeId] && byId.get(nodeId)?.parent !== undefined,
    reveal(nodeId: string) {
      if (!state.recall || state.recall.revealed[nodeId]) return;
      // From the latest state, so quick reveals in a row all count.
      setState((s) => (s.recall ? { ...s, recall: { revealed: { ...s.recall.revealed, [nodeId]: true } } } : s));
      emit({ type: "node.toggled", nodeId, expanded: true });
    },
    /** Back to the centre; then each "next" opens one more branch, in reading order. */
    stepThrough() {
      const parents = new Set(nodes.map((n) => n.parent));
      const collapsed: Record<string, boolean> = {};
      for (const n of nodes) if (n.parent !== undefined && parents.has(n.id)) collapsed[n.id] = true;
      setState((s) => ({ ...s, collapsed, stepping: true }));
    },
    showNext(): string | undefined {
      // The first visible topic that still has hidden children.
      const next = layout.nodes.find((p) => p.hasChildren && !p.expanded);
      if (!next) {
        setState((s) => ({ ...s, stepping: false }));
        return undefined;
      }
      setState((s) => ({ ...s, collapsed: { ...s.collapsed, [next.node.id]: false } }));
      emit({ type: "node.toggled", nodeId: next.node.id, expanded: true });
      return next.node.id;
    },
    resetLayout: () => setState((s) => ({ ...s, offsets: {} })),
  };
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; origin: View; moved: boolean }
  | { kind: "node"; id: string; startX: number; startY: number; dx: number; dy: number; moved: boolean };

type Fullscreen = "off" | "native" | "window";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg className="ix-mindmap__icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  fit: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3",
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  shrink: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  steps: "M5 12h3l3-6 4 12 3-6h1",
  next: "M5 12h14M13 6l6 6-6 6",
  unfold: "M7 15l5 5 5-5M7 9l5-5 5 5",
  fold: "M7 20l5-5 5 5M7 4l5 5 5-5",
  tidy: "M3 6h18M7 12h10M10 18h4",
};

/** Below this width the map grows to the right only, so it reads top to bottom instead of shrinking to fit both sides. */
const NARROW = 560;

export function Mindmap(props: MindmapProps) {
  const [narrow, setNarrow] = useState(false);
  const map = useMindmap(props, props.direction ?? (narrow ? "right" : undefined));
  const { state, layout } = map;
  const draggable = props.draggable ?? true;
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // Hidden until the first fit, so the map never paints in the corner and jumps.
  const [fitted, setFitted] = useState(false);
  const fittedRef = useRef(false);
  // Animate the view for fits and keyboard moves, not while the learner drags or pinches.
  const [smooth, setSmooth] = useState(false);
  // While true the view follows the map (it refits on resize and on big changes); moving it by hand turns that off.
  const auto = useRef(true);
  const refit = useRef(false);
  const anchor = useRef<{ id: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | undefined>(() => layout.nodes[0]?.node.id);
  const [editing, setEditing] = useState<string | null>(null);
  const cancelEdit = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [fullscreen, setFullscreen] = useState<Fullscreen>("off");
  const [menu, setMenu] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const placed = useMemo(() => new Map(layout.nodes.map((p) => [p.node.id, p])), [layout]);
  const title = props.title ?? (layout.nodes[0] ? map.labelOf(layout.nodes[0].node.id) : "Mind map");
  const focusId = selected && placed.has(selected) ? selected : layout.nodes[0]?.node.id;

  // Each node's position: its layout spot moved by its own and its ancestors' drags. Parents come first, so one pass does it.
  const positions = useMemo(() => {
    const shift = new Map<string, { x: number; y: number }>();
    const out = new Map<string, { x: number; y: number }>();
    for (const p of layout.nodes) {
      const base = (p.node.parent && shift.get(p.node.parent)) || { x: 0, y: 0 };
      const own = state.offsets[p.node.id];
      const live = drag?.kind === "node" && drag.id === p.node.id ? drag : undefined;
      const s = { x: base.x + (own?.x ?? 0) + (live?.dx ?? 0), y: base.y + (own?.y ?? 0) + (live?.dy ?? 0) };
      shift.set(p.node.id, s);
      out.set(p.node.id, { x: p.x + s.x, y: p.y + s.y });
    }
    return out;
  }, [layout, state.offsets, drag]);

  const bounds = () => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of layout.nodes) {
      const pos = positions.get(p.node.id)!;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + p.w);
      maxY = Math.max(maxY, pos.y + p.h);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  };

  /** Fits the whole map in view. Returns false while the viewport has no size yet (hidden, or not laid out). */
  const fit = (animate = false): boolean => {
    const el = viewport.current;
    if (!el || !el.clientWidth || !el.clientHeight || !layout.nodes.length) return false;
    const b = bounds();
    const pad = Math.min(40, el.clientWidth * 0.06);
    const scale = clampScale(Math.min(1, (el.clientWidth - pad * 2) / b.width, (el.clientHeight - pad * 2) / b.height));
    setSmooth(animate);
    setView({ scale, x: Math.round((el.clientWidth - b.width * scale) / 2 - b.minX * scale), y: Math.round((el.clientHeight - b.height * scale) / 2 - b.minY * scale) });
    setFitted(true);
    fittedRef.current = true;
    auto.current = true;
    return true;
  };
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useLayoutEffect(() => {
    const el = viewport.current;
    // A narrow block re-lays the map out first; the fit follows that.
    if (el && el.clientWidth && el.clientWidth < NARROW && !props.direction) setNarrow(true);
    else fitRef.current();
  }, []);

  // Refit when the block changes size (a resized window, a tab that was hidden, fullscreen), unless the learner has moved the view; then keep its centre where it was.
  useEffect(() => {
    const el = viewport.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let size = { w: el.clientWidth, h: el.clientHeight };
    if (size.w) setNarrow(size.w < NARROW);
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = { w: el.clientWidth, h: el.clientHeight };
        if (next.w === size.w && next.h === size.h) return;
        const dx = (next.w - size.w) / 2;
        const dy = (next.h - size.h) / 2;
        size = next;
        if (size.w) setNarrow(size.w < NARROW);
        if (auto.current || !size.w) fitRef.current();
        else {
          setSmooth(false);
          setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // After the map changes shape: keep a toggled node where it was on screen, or refit for big changes.
  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const a = anchor.current;
    anchor.current = null;
    if (refit.current || (auto.current && !a)) {
      refit.current = false;
      fitRef.current(fittedRef.current);
      return;
    }
    const pos = a ? positions.get(a.id) : undefined;
    if (!a || !pos) return;
    const v = viewRef.current;
    const x = a.x - pos.x * v.scale;
    const y = a.y - pos.y * v.scale;
    if (x !== v.x || y !== v.y) {
      setSmooth(false);
      setView({ ...v, x, y });
    }
    // positions follow layout; this runs once per layout change on purpose
  }, [layout]);

  const zoomAt = (factor: number, px?: number, py?: number, animate = false) => {
    const el = viewport.current;
    const cx_ = px ?? (el?.clientWidth ?? 0) / 2;
    const cy_ = py ?? (el?.clientHeight ?? 0) / 2;
    auto.current = false;
    setSmooth(animate);
    setView((v) => {
      const scale = clampScale(v.scale * factor);
      return { scale, x: cx_ - (cx_ - v.x) * (scale / v.scale), y: cy_ - (cy_ - v.y) * (scale / v.scale) };
    });
  };

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms. Plain wheel scrolls the page as usual.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Fullscreen: the browser's when it has one (not on iPhone), else the window.
  useEffect(() => {
    const onChange = () => setFullscreen((f) => (document.fullscreenElement && document.fullscreenElement === shell.current ? "native" : f === "native" ? "off" : f));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = async () => {
    auto.current = true;
    if (fullscreen === "native") return void (await document.exitFullscreen?.().catch(() => undefined));
    if (fullscreen === "window") return setFullscreen("off");
    const el = shell.current;
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Not allowed here (an iframe without permission, say): fill the window instead.
      }
    }
    setFullscreen("window");
  };

  // The download menu closes on a click outside it.
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (!(event.target as HTMLElement).closest?.(".ix-mindmap__menu-wrap")) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const exportAs = async (format: "png" | "svg") => {
    setMenu(false);
    setExportError(null);
    if (!shell.current || !layout.nodes.length) return;
    // The real labels, also for topics hidden by Test yourself.
    const { svg, width, height } = mindmapSvg(layout.nodes, positions, readColors(shell.current), title);
    try {
      if (format === "svg") downloadSvg(svg, title);
      else await downloadPng(svg, width, height, title);
    } catch {
      setExportError("Couldn't make the image. Try SVG instead.");
    }
  };

  const select = (nodeId: string, focus = true) => {
    setSelected(nodeId);
    if (!focus) return;
    items.current.get(nodeId)?.focus({ preventScroll: true });
    // Keep the newly focused node on screen.
    const p = placed.get(nodeId);
    const el = viewport.current;
    const pos = positions.get(nodeId);
    if (!p || !pos || !el || !el.clientWidth) return;
    const v = viewRef.current;
    const left = pos.x * v.scale + v.x;
    const top = pos.y * v.scale + v.y;
    const margin = 24;
    let { x, y } = v;
    if (left + p.w * v.scale > el.clientWidth - margin) x -= left + p.w * v.scale - (el.clientWidth - margin);
    if (left + (x - v.x) < margin) x += margin - (left + (x - v.x));
    if (top + p.h * v.scale > el.clientHeight - margin) y -= top + p.h * v.scale - (el.clientHeight - margin);
    if (top + (y - v.y) < margin) y += margin - (top + (y - v.y));
    if (x !== v.x || y !== v.y) {
      auto.current = false;
      setSmooth(true);
      setView({ ...v, x, y });
    }
  };

  const reveal = (nodeId: string) => {
    map.reveal(nodeId);
    setAnnouncement(`Revealed: ${map.labelOf(nodeId)}`);
  };
  const recallTotal = map.byId.size - 1;
  const recallCount = state.recall ? Object.keys(state.recall.revealed).filter((k) => map.byId.has(k)).length : 0;

  const toggle = (p: PlacedNode) => {
    if (!p.hasChildren) return;
    // Keep this node still on screen while its branch opens or closes around it.
    const pos = positions.get(p.node.id);
    const v = viewRef.current;
    if (pos) anchor.current = { id: p.node.id, x: pos.x * v.scale + v.x, y: pos.y * v.scale + v.y };
    auto.current = false;
    map.setExpanded(p.node.id, !p.expanded);
    setAnnouncement(`${map.labelOf(p.node.id)} ${p.expanded ? "collapsed" : "expanded"}`);
  };

  /** Runs a change to the whole map, then fits the result. */
  const reshape = (change: () => void) => {
    refit.current = true;
    change();
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLDivElement>, p: PlacedNode) => {
    if (editing) return;
    const index = layout.nodes.indexOf(p);
    const parent = p.node.parent;
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        if (layout.nodes[index + 1]) select(layout.nodes[index + 1]!.node.id);
        break;
      case "ArrowUp":
        if (index > 0) select(layout.nodes[index - 1]!.node.id);
        break;
      case "ArrowRight":
        if (p.hasChildren && !p.expanded) toggle(p);
        else if (p.expanded) select(layout.nodes[index + 1]!.node.id);
        break;
      case "ArrowLeft":
        if (p.expanded) toggle(p);
        else if (parent) select(parent);
        break;
      case "Home":
        select(layout.nodes[0]!.node.id);
        break;
      case "End":
        select(layout.nodes[layout.nodes.length - 1]!.node.id);
        break;
      case "Enter":
      case " ":
        if (map.isHidden(p.node.id)) reveal(p.node.id);
        else toggle(p);
        break;
      case "F2":
        if (props.editable) setEditing(p.node.id);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onFrameKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && (menu || fullscreen === "window")) {
      if (menu) setMenu(false);
      else void toggleFullscreen();
      event.preventDefault();
      return;
    }
    if (isTyping(event) || hasModifier(event)) return;
    if (event.key === "+" || event.key === "=") zoomAt(1.2, undefined, undefined, true);
    else if (event.key === "-") zoomAt(1 / 1.2, undefined, undefined, true);
    else if (event.key === "0") fit(true);
    else if (event.key === "f" && !editing) void toggleFullscreen();
    else return;
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editing) return;
    if ((event.target as HTMLElement).closest(".ix-mindmap__toggle")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSmooth(false);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, scale: viewRef.current.scale };
      setDrag(null);
      return;
    }
    const nodeEl = (event.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    if (nodeEl) setDrag({ kind: "node", id: nodeEl.dataset.nodeId!, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, moved: false });
    else setDrag({ kind: "pan", startX: event.clientX, startY: event.clientY, origin: viewRef.current, moved: false });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      // Against the scale when the pinch began, so it tracks the fingers without drifting.
      const target = clampScale((pinch.current.scale * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.current.distance);
      zoomAt(target / viewRef.current.scale, (a!.x + b!.x) / 2 - rect.left, (a!.y + b!.y) / 2 - rect.top);
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.kind === "pan") {
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      auto.current = false;
      if (!drag.moved) setDrag({ ...drag, moved: true });
      setView({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy });
    } else if (draggable && (drag.moved || Math.hypot(dx, dy) > 4)) {
      auto.current = false;
      setDrag({ ...drag, moved: true, dx: dx / viewRef.current.scale, dy: dy / viewRef.current.scale });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag?.kind === "node") {
      if (drag.moved) map.move(drag.id, drag.dx, drag.dy);
      else {
        // A click selects (and shows the note); the round handle opens and closes.
        select(drag.id);
        if (map.isHidden(drag.id)) reveal(drag.id);
      }
    }
    setDrag(null);
  };

  const selectedNode = focusId ? map.byId.get(focusId) : undefined;
  const anyCollapsed = Object.keys(state.collapsed).some((k) => state.collapsed[k] && map.byId.has(k));
  const canCollapse = layout.nodes.some((p) => p.depth >= 1 && p.hasChildren);

  return (
    <ActivityFrame type="mindmap" title={props.title} description={props.description} label="Mind map" theme={props.theme} className={props.className} onKeyDown={onFrameKeyDown}>
      <div ref={shell} className={cx("ix-mindmap__shell", fullscreen !== "off" && "ix-mindmap__shell--full", fullscreen === "window" && "ix-mindmap__shell--window")}>
        <div className="ix-mindmap__toolbar" role="toolbar" aria-label="Mind map tools">
          <div className="ix-mindmap__group">
            <button type="button" className="ix-mindmap__tool" onClick={() => zoomAt(1 / 1.2, undefined, undefined, true)} aria-label="Zoom out" title="Zoom out (−)">
              <Icon d={ICONS.minus} />
            </button>
            <span className="ix-mindmap__zoom" aria-live="off">
              {Math.round(view.scale * 100)}%
            </span>
            <button type="button" className="ix-mindmap__tool" onClick={() => zoomAt(1.2, undefined, undefined, true)} aria-label="Zoom in" title="Zoom in (+)">
              <Icon d={ICONS.plus} />
            </button>
          </div>
          <button type="button" className="ix-mindmap__tool" onClick={() => fit(true)} aria-label="Fit to view" title="Fit to view (0)">
            <Icon d={ICONS.fit} />
          </button>
          <button type="button" className="ix-mindmap__tool" onClick={() => void toggleFullscreen()} aria-label={fullscreen === "off" ? "Full screen" : "Exit full screen"} title={fullscreen === "off" ? "Full screen (F)" : "Exit full screen (Esc)"} aria-pressed={fullscreen !== "off"}>
            <Icon d={fullscreen === "off" ? ICONS.expand : ICONS.shrink} />
          </button>
          <div className="ix-mindmap__menu-wrap">
            <button type="button" className="ix-mindmap__tool" onClick={() => setMenu((m) => !m)} aria-label="Download" title="Download as an image" aria-haspopup="menu" aria-expanded={menu}>
              <Icon d={ICONS.download} />
            </button>
            {menu ? (
              <div className="ix-mindmap__menu" role="menu">
                <button type="button" role="menuitem" className="ix-mindmap__menu-item" onClick={() => void exportAs("png")} autoFocus>
                  PNG image
                </button>
                <button type="button" role="menuitem" className="ix-mindmap__menu-item" onClick={() => void exportAs("svg")}>
                  SVG (scalable)
                </button>
              </div>
            ) : null}
          </div>
          <span className="ix-toolbar__spacer" />
          {state.recall ? (
            <>
              <span className="ix-small ix-mindmap__progress" aria-live="polite">
                Revealed {recallCount} of {recallTotal}
              </span>
              <button type="button" className="ix-mindmap__action" onClick={map.stopRecall}>
                <Icon d={ICONS.eye} />
                <span className="ix-mindmap__action-text">Show all</span>
              </button>
            </>
          ) : (
            <button type="button" className="ix-mindmap__action" onClick={() => reshape(map.startRecall)} title="Hide the topics and try to remember each before revealing it">
              <Icon d={ICONS.eye} />
              <span className="ix-mindmap__action-text">Test yourself</span>
            </button>
          )}
          {state.stepping ? (
            <button
              type="button"
              className="ix-mindmap__action ix-mindmap__action--primary"
              onClick={() =>
                reshape(() => {
                  const opened = map.showNext();
                  setAnnouncement(opened ? `Opened ${map.labelOf(opened)}` : "Every branch is open");
                })
              }
            >
              <Icon d={ICONS.next} />
              <span className="ix-mindmap__action-text">Show next</span>
            </button>
          ) : (
            <button type="button" className="ix-mindmap__action" onClick={() => reshape(map.stepThrough)} title="Start from the central idea and open one branch at a time">
              <Icon d={ICONS.steps} />
              <span className="ix-mindmap__action-text">Step through</span>
            </button>
          )}
          {anyCollapsed ? (
            <button type="button" className="ix-mindmap__action" onClick={() => reshape(map.expandAll)}>
              <Icon d={ICONS.unfold} />
              <span className="ix-mindmap__action-text">Expand all</span>
            </button>
          ) : canCollapse ? (
            <button type="button" className="ix-mindmap__action" onClick={() => reshape(map.collapseAll)}>
              <Icon d={ICONS.fold} />
              <span className="ix-mindmap__action-text">Collapse all</span>
            </button>
          ) : null}
          {Object.keys(state.offsets).length ? (
            <button type="button" className="ix-mindmap__action" onClick={() => reshape(map.resetLayout)}>
              <Icon d={ICONS.tidy} />
              <span className="ix-mindmap__action-text">Tidy layout</span>
            </button>
          ) : null}
        </div>

        <div
          ref={viewport}
          className={cx("ix-mindmap__viewport", drag?.kind === "pan" && drag.moved && "ix-mindmap__viewport--panning")}
          style={{ height: props.height ?? 480 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className={cx("ix-mindmap__stage", smooth && "ix-mindmap__stage--smooth")}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, opacity: fitted ? 1 : 0 }}
          >
            <svg className="ix-mindmap__edges" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.nodes.map((p) => {
                const parentPlaced = p.node.parent ? placed.get(p.node.parent) : undefined;
                const parentPos = p.node.parent ? positions.get(p.node.parent) : undefined;
                if (!parentPlaced || !parentPos) return null;
                const pos = positions.get(p.node.id)!;
                const { start, end } = edgeEnds({ ...parentPlaced, ...parentPos }, { ...p, ...pos });
                return <path key={p.node.id} d={edgePath(start, end)} data-branch={p.branch % BRANCH_COUNT} className={p.depth === 1 ? "ix-mindmap__edge--main" : undefined} />;
              })}
            </svg>
            <div role="tree" aria-label={title} className="ix-mindmap__tree">
              {layout.nodes.map((p) => {
                const pos = positions.get(p.node.id)!;
                const hidden = map.isHidden(p.node.id);
                const label = hidden ? "Hidden topic: what goes here? Press Enter to reveal" : map.labelOf(p.node.id);
                const isSelected = p.node.id === focusId;
                // Highlighted only once the learner picks a node, not the default tab stop.
                const highlighted = p.node.id === selected;
                return (
                  <div
                    key={p.node.id}
                    ref={(el) => {
                      if (el) items.current.set(p.node.id, el);
                      else items.current.delete(p.node.id);
                    }}
                    role="treeitem"
                    aria-level={p.depth + 1}
                    aria-setsize={p.siblings}
                    aria-posinset={p.position}
                    aria-expanded={p.hasChildren ? p.expanded : undefined}
                    aria-selected={isSelected}
                    aria-label={label}
                    tabIndex={isSelected ? 0 : -1}
                    data-node-id={p.node.id}
                    data-branch={p.branch < 0 ? undefined : p.branch % BRANCH_COUNT}
                    data-side={p.side}
                    className={cx(
                      "ix-mindmap__node",
                      `ix-mindmap__node--d${Math.min(p.depth, 2)}`,
                      p.depth === 0 && "ix-mindmap__node--root",
                      hidden && "ix-mindmap__node--hidden",
                      highlighted && "ix-mindmap__node--selected",
                      drag?.kind === "node" && drag.id === p.node.id && drag.moved && "ix-mindmap__node--dragging",
                    )}
                    style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: p.w, height: p.h }}
                    onKeyDown={(e) => onItemKeyDown(e, p)}
                    onFocus={() => setSelected(p.node.id)}
                    onDoubleClick={() => props.editable && !hidden && setEditing(p.node.id)}
                  >
                    {editing === p.node.id ? (
                      <input
                        className="ix-mindmap__input"
                        defaultValue={label}
                        aria-label={`Rename ${label}`}
                        maxLength={LIMITS.titleLength}
                        autoFocus
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            cancelEdit.current = true;
                            items.current.get(p.node.id)?.focus();
                          }
                        }}
                        onBlur={(e) => {
                          if (!cancelEdit.current) map.rename(p.node.id, e.currentTarget.value);
                          cancelEdit.current = false;
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <span className="ix-mindmap__label" title={hidden || p.lines.join(" ") === label ? undefined : label}>
                        {hidden
                          ? "?"
                          : props.renderNode
                            ? props.renderNode({ node: p.node, label, depth: p.depth, expanded: p.expanded, hasChildren: p.hasChildren, selected: isSelected })
                            : p.lines.map((line, i) => (
                                <span key={i} className="ix-mindmap__line">
                                  {line}
                                </span>
                              ))}
                      </span>
                    )}
                    {p.node.note && !hidden && p.depth < 2 ? <span className="ix-mindmap__has-note" aria-hidden="true" /> : null}
                    {p.hasChildren && p.depth > 0 ? (
                      <span
                        className={cx("ix-mindmap__toggle", !p.expanded && "ix-mindmap__toggle--closed")}
                        aria-hidden="true"
                        title={p.expanded ? "Collapse" : `Show ${p.descendants} more`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(p);
                        }}
                      >
                        {p.expanded ? "−" : p.descendants > 99 ? "99+" : p.descendants}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {selectedNode?.note && !map.isHidden(selectedNode.id) ? (
            <div className="ix-mindmap__detail" role="note" onPointerDown={(e) => e.stopPropagation()}>
              <p className="ix-mindmap__detail-title">{map.labelOf(selectedNode.id)}</p>
              <p className="ix-mindmap__detail-text">{selectedNode.note}</p>
            </div>
          ) : null}
        </div>
        {exportError ? (
          <p className="ix-small ix-mindmap__error" role="alert">
            {exportError}
          </p>
        ) : null}
      </div>
      <p className="ix-visually-hidden">
        Drag to move · Ctrl/⌘ + scroll to zoom · Arrows move between topics, Enter opens or closes{props.editable ? ", F2 renames" : ""} · 0 fits · F full screen
      </p>
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}
