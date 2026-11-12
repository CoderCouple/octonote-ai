import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { LIMITS, type MindmapNode } from "../core/index.js";
import { useControllableState } from "../react/index.js";
import { DEFAULT_LAYOUT, defaultCollapsed, layoutMindmap, type PlacedNode } from "./mindmap-layout.js";
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
  /** Height of the map area in pixels. Defaults to 460. */
  height?: number;
  /** Replaces the label inside each node. */
  renderNode?: (info: MindmapNodeRenderInfo) => ReactNode;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 2;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const { nodeWidth: NODE_W, nodeHeight: NODE_H } = DEFAULT_LAYOUT;

const usable = (state: MindmapState | undefined): state is MindmapState =>
  !!state && typeof state.collapsed === "object" && typeof state.labels === "object" && typeof state.offsets === "object" && typeof state.seen === "object";

/** Headless mind map state: expanding, renaming and moving nodes. */
export function useMindmap(props: MindmapProps) {
  const { nodes } = props;
  const { id, emit } = useActivity("mindmap", props);
  const [state, setState] = useControllableState<MindmapState>(
    usable(props.state) ? props.state : undefined,
    () => (usable(props.defaultState) ? props.defaultState : { collapsed: defaultCollapsed(nodes), labels: {}, offsets: {}, seen: {}, completed: false }),
    props.onStateChange,
  );
  const layout = useMemo(() => layoutMindmap(nodes, state.collapsed), [nodes, state.collapsed]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Count newly visible nodes as seen; finishing the map means seeing every node.
  useEffect(() => {
    const unseen = layout.nodes.filter((p) => !state.seen[p.node.id]);
    if (!unseen.length) return;
    const seen = { ...state.seen };
    unseen.forEach((p) => (seen[p.node.id] = true));
    const completed = state.completed || Object.keys(seen).length >= nodes.length;
    setState((s) => ({ ...s, seen, completed }));
    if (completed && !state.completed) emit({ type: "activity.completed" });
  }, [layout, state.seen, state.completed, nodes.length, setState, emit]);

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
    /** Hide every topic but the centre; the learner recalls each before revealing it. */
    startRecall() {
      setState((s) => ({ ...s, collapsed: {}, recall: { revealed: {} } }));
      emit({ type: "activity.started" });
    },
    stopRecall: () => setState((s) => ({ ...s, recall: undefined })),
    isHidden: (nodeId: string) => !!state.recall && !state.recall.revealed[nodeId] && byId.get(nodeId)?.parent !== undefined,
    reveal(nodeId: string) {
      if (!state.recall || state.recall.revealed[nodeId]) return;
      const revealed = { ...state.recall.revealed, [nodeId]: true as const };
      setState((s) => ({ ...s, recall: { revealed } }));
      emit({ type: "node.toggled", nodeId, expanded: true });
      if (Object.keys(revealed).length >= nodes.length - 1) emit({ type: "activity.completed" });
    },
    /** Back to the centre; then each "next" opens one more branch, in reading order. */
    stepThrough() {
      const collapsed: Record<string, boolean> = {};
      for (const n of nodes) if (n.parent !== undefined && nodes.some((c) => c.parent === n.id)) collapsed[n.id] = true;
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
  | { kind: "pan"; startX: number; startY: number; origin: View }
  | { kind: "node"; id: string; startX: number; startY: number; dx: number; dy: number; moved: boolean };

export function Mindmap(props: MindmapProps) {
  const map = useMindmap(props);
  const { state, layout } = map;
  const draggable = props.draggable ?? true;
  const viewport = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const [selected, setSelected] = useState<string | undefined>(() => layout.nodes[0]?.node.id);
  const [editing, setEditing] = useState<string | null>(null);
  const cancelEdit = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const placed = useMemo(() => new Map(layout.nodes.map((p) => [p.node.id, p])), [layout]);
  const focusId = selected && placed.has(selected) ? selected : layout.nodes[0]?.node.id;

  /** A node's position: layout plus its own and its ancestors' drag offsets. */
  const positionOf = (p: PlacedNode) => {
    let x = p.x;
    let y = p.y;
    for (let n: MindmapNode | undefined = p.node; n; n = n.parent ? map.byId.get(n.parent) : undefined) {
      const o = state.offsets[n.id];
      if (o) {
        x += o.x;
        y += o.y;
      }
      if (drag?.kind === "node" && drag.id === n.id) {
        x += drag.dx;
        y += drag.dy;
      }
    }
    return { x, y };
  };

  const fit = () => {
    const el = viewport.current;
    if (!el || !el.clientWidth || !layout.nodes.length) return;
    const points = layout.nodes.map(positionOf);
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const width = Math.max(...points.map((p) => p.x)) + NODE_W - minX;
    const height = Math.max(...points.map((p) => p.y)) + NODE_H - minY;
    const pad = 32;
    const scale = clampScale(Math.min(1.2, (el.clientWidth - pad * 2) / width, (el.clientHeight - pad * 2) / height));
    setView({ scale, x: (el.clientWidth - width * scale) / 2 - minX * scale, y: (el.clientHeight - height * scale) / 2 - minY * scale });
  };

  useLayoutEffect(fit, []); // fit once on open; afterwards the learner controls the view

  const zoomAt = (factor: number, px?: number, py?: number) => {
    const el = viewport.current;
    const cx_ = px ?? (el?.clientWidth ?? 0) / 2;
    const cy_ = py ?? (el?.clientHeight ?? 0) / 2;
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

  const select = (nodeId: string, focus = true) => {
    setSelected(nodeId);
    if (!focus) return;
    items.current.get(nodeId)?.focus({ preventScroll: true });
    // Keep the newly focused node on screen.
    const p = placed.get(nodeId);
    const el = viewport.current;
    if (!p || !el || !el.clientWidth) return;
    const pos = positionOf(p);
    setView((v) => {
      const left = pos.x * v.scale + v.x;
      const top = pos.y * v.scale + v.y;
      const margin = 24;
      let { x, y } = v;
      if (left < margin) x += margin - left;
      if (left + NODE_W * v.scale > el.clientWidth - margin) x -= left + NODE_W * v.scale - (el.clientWidth - margin);
      if (top < margin) y += margin - top;
      if (top + NODE_H * v.scale > el.clientHeight - margin) y -= top + NODE_H * v.scale - (el.clientHeight - margin);
      return x === v.x && y === v.y ? v : { ...v, x, y };
    });
  };

  const reveal = (nodeId: string) => {
    map.reveal(nodeId);
    setAnnouncement(`Revealed: ${map.labelOf(nodeId)}`);
  };
  const recallTotal = map.byId.size - 1;
  const recallCount = state.recall ? Object.keys(state.recall.revealed).length : 0;

  const toggle = (p: PlacedNode) => {
    if (!p.hasChildren) return;
    map.setExpanded(p.node.id, !p.expanded);
    setAnnouncement(`${map.labelOf(p.node.id)} ${p.expanded ? "collapsed" : "expanded"}`);
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
    if (isTyping(event) || hasModifier(event)) return;
    if (event.key === "+" || event.key === "=") zoomAt(1.2);
    else if (event.key === "-") zoomAt(1 / 1.2);
    else if (event.key === "0") fit();
    else return;
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editing) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: view.scale };
      setDrag(null);
      return;
    }
    const nodeEl = (event.target as HTMLElement).closest<HTMLElement>("[data-node-id]");
    if (nodeEl) {
      setDrag({ kind: "node", id: nodeEl.dataset.nodeId!, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, moved: false });
    } else {
      setDrag({ kind: "pan", startX: event.clientX, startY: event.clientY, origin: view });
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = event.currentTarget.getBoundingClientRect();
      const factor = (pinch.current.scale * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.current.distance / view.scale;
      zoomAt(factor, (a!.x + b!.x) / 2 - rect.left, (a!.y + b!.y) / 2 - rect.top);
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.kind === "pan") {
      setView({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy });
    } else if (draggable && (drag.moved || Math.hypot(dx, dy) > 4)) {
      setDrag({ ...drag, moved: true, dx: dx / view.scale, dy: dy / view.scale });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag?.kind === "node") {
      if (drag.moved) map.move(drag.id, drag.dx, drag.dy);
      else {
        select(drag.id);
        if (map.isHidden(drag.id)) reveal(drag.id);
      }
    }
    setDrag(null);
  };

  const selectedNode = focusId ? map.byId.get(focusId) : undefined;
  const positions = new Map(layout.nodes.map((p) => [p.node.id, positionOf(p)]));

  return (
    <ActivityFrame type="mindmap" title={props.title} description={props.description} label="Mind map" theme={props.theme} className={props.className} onKeyDown={onFrameKeyDown}>
      <div className="ix-mindmap__toolbar">
        <button type="button" className="ix-button ix-button--ghost" onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">
          −
        </button>
        <span className="ix-small ix-muted ix-mindmap__zoom" aria-live="off">
          {Math.round(view.scale * 100)}%
        </span>
        <button type="button" className="ix-button ix-button--ghost" onClick={() => zoomAt(1.2)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="ix-button ix-button--ghost" onClick={fit}>
          Fit
        </button>
        <span className="ix-toolbar__spacer" />
        {state.recall ? (
          <>
            <span className="ix-small ix-mindmap__progress" aria-live="polite">
              Revealed {recallCount} of {recallTotal}
            </span>
            <button type="button" className="ix-button ix-button--ghost" onClick={map.stopRecall}>
              Show all
            </button>
          </>
        ) : (
          <button type="button" className="ix-button ix-button--ghost" onClick={map.startRecall} title="Hide the topics and try to remember each before revealing it">
            Test yourself
          </button>
        )}
        {state.stepping ? (
          <button
            type="button"
            className="ix-button ix-button--primary"
            onClick={() => {
              const opened = map.showNext();
              setAnnouncement(opened ? `Opened ${map.labelOf(opened)}` : "Every branch is open");
            }}
          >
            Show next
          </button>
        ) : (
          <button type="button" className="ix-button ix-button--ghost" onClick={map.stepThrough} title="Start from the central idea and open one branch at a time">
            Step through
          </button>
        )}
        {Object.keys(state.collapsed).some((k) => state.collapsed[k]) ? (
          <button type="button" className="ix-button ix-button--ghost" onClick={map.expandAll}>
            Expand all
          </button>
        ) : null}
        {Object.keys(state.offsets).length ? (
          <button type="button" className="ix-button ix-button--ghost" onClick={map.resetLayout}>
            Tidy layout
          </button>
        ) : null}
      </div>

      <div
        ref={viewport}
        className={cx("ix-mindmap__viewport", drag?.kind === "pan" && "ix-mindmap__viewport--panning")}
        style={{ height: props.height ?? 460 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ix-mindmap__stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="ix-mindmap__edges" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.nodes.map((p) => {
              const parent = p.node.parent ? positions.get(p.node.parent) : undefined;
              if (!parent) return null;
              const child = positions.get(p.node.id)!;
              const x1 = parent.x + NODE_W;
              const y1 = parent.y + NODE_H / 2;
              const x2 = child.x;
              const y2 = child.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return <path key={p.node.id} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} data-branch={p.branch % 6} />;
            })}
          </svg>
          <div role="tree" aria-label={props.title ?? "Mind map"} className="ix-mindmap__tree">
            {layout.nodes.map((p) => {
              const pos = positions.get(p.node.id)!;
              const hidden = map.isHidden(p.node.id);
              const label = hidden ? "Hidden topic: what goes here? Press Enter to reveal" : map.labelOf(p.node.id);
              const isSelected = p.node.id === focusId;
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
                  data-branch={p.branch < 0 ? undefined : p.branch % 6}
                  className={cx("ix-mindmap__node", p.depth === 0 && "ix-mindmap__node--root", hidden && "ix-mindmap__node--hidden", isSelected && "ix-mindmap__node--selected", drag?.kind === "node" && drag.id === p.node.id && drag.moved && "ix-mindmap__node--dragging")}
                  style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: NODE_W, height: NODE_H }}
                  onKeyDown={(e) => onItemKeyDown(e, p)}
                  onFocus={() => setSelected(p.node.id)}
                  onDoubleClick={() => props.editable && setEditing(p.node.id)}
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
                    <span className="ix-mindmap__label" title={hidden ? undefined : label}>
                      {hidden ? "?" : props.renderNode ? props.renderNode({ node: p.node, label, depth: p.depth, expanded: p.expanded, hasChildren: p.hasChildren, selected: isSelected }) : label}
                    </span>
                  )}
                  {p.hasChildren ? (
                    <span
                      className="ix-mindmap__toggle"
                      aria-hidden="true"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(p);
                      }}
                    >
                      {p.expanded ? "−" : "+"}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedNode && !map.isHidden(selectedNode.id) ? (
        <div className="ix-mindmap__detail">
          <p className="ix-mindmap__detail-title">{map.labelOf(selectedNode.id)}</p>
          {selectedNode.note ? <p className="ix-muted">{selectedNode.note}</p> : null}
        </div>
      ) : null}
      <p className="ix-small ix-muted ix-shortcuts">
        Drag to move around, Ctrl or ⌘ + scroll to zoom. Keys: arrows to move between topics, Enter to open or close{props.editable ? ", F2 to rename" : ""}, + and − to zoom, 0 to fit.
      </p>
      <LiveRegion message={announcement} />
    </ActivityFrame>
  );
}
