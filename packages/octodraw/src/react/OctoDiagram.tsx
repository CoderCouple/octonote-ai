import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { collectFontCss, copyBlob, copyText, downloadBlob, embedSnippets, svgToPdf, svgToPng } from '../export/browser';
import { exportEraserJson, exportEraserXml } from '../export/eraserJson';
import { renderDiagramSvg } from '../export/svg';
import { ancestorsOf, connectionsOf, FACETS, facetValues, filterEmphasis, flowEmphasis, isFilterActive, type FacetName, type MapFilter } from '../maps/maps';
import type { DiagramNode } from '../dsl/types';
import { detectDiagramType, type DiagramType } from '../dsl/detect';
import { parseErd } from '../dsl/erd';
import { parseSequence } from '../dsl/sequence';
import { BpmnSvg, layoutBpmn } from '../bpmn/bpmn';
import { arrangeErd, ErdSvg, layoutErd, type ErdLayout } from '../erd/erd';
import { layoutSequence, SequenceSvg } from '../sequence/sequence';
import { parseDiagram } from '../dsl/parse';
import { importEraserJson, looksLikeEraserJson } from '../eraser/importJson';
import type { Diagnostic } from '../dsl/types';
import { loadEraserIcons, loadFullIconCatalog, loadVendorIcons, onIconCatalogChange, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { snapBox, type SnapResult } from '../canvas/model';
import { arrangeLayout, canResizeNode, placementKey, type NodePlacement, type ViewPlacements } from '../layout/arrange';
import { layoutView, type DiagramLayout, type TextMeasurer, type Typography } from '../layout/layout';
import { themeCssVariables, themes, type ColorScheme, type Theme } from '../theme/tokens';
import { buildView, canDrillInto } from '../view/view';
import { DiagramSvg, fontFamilyFor, type DiagramAnimation } from './DiagramSvg';

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'json' | 'xml';
export type CopyFormat = 'png' | 'svg' | 'json' | 'xml' | 'link' | 'markdown' | 'html';

/** Imperative export API, via `ref`. Exports the current view (drill level and collapsed groups included). */
export interface OctoDiagramHandle {
  exportSvg(options?: { embedFonts?: boolean; title?: boolean }): Promise<string>;
  exportPng(options?: { scale?: number }): Promise<Blob>;
  exportPdf(): Promise<Blob>;
  /** Eraser element JSON (round-trips through importEraserJson). */
  exportJson(): string;
  /** Eraser's XML flavour of the element model. */
  exportXml(): string;
  download(format: ExportFormat, filename?: string): Promise<void>;
  copy(format: CopyFormat): Promise<void>;
}

export interface OctoDiagramProps {
  ref?: Ref<OctoDiagramHandle>;
  /** Diagram type; 'auto' (default) infers architecture/flowchart, ERD or sequence from the code. */
  type?: DiagramType | 'auto';
  /** Show the Export control in the canvas overlay. Defaults to true. */
  exportMenu?: boolean;
  /** Called when a node is selected (clicked) or the selection is cleared. */
  onSelect?: (nodeId: string | null) => void;
  /** Extra content for the details panel of the selected node (e.g. host records). */
  renderDetails?: (node: DiagramNode) => React.ReactNode;
  /** Show the details panel when a node is clicked. Defaults to true. */
  detailsPanel?: boolean;
  /** Where this diagram lives in the host (enables Copy link / Markdown / HTML embed). */
  share?: { url: string; imageUrl?: string };
  /** Diagram-as-code source. */
  source: string;
  /** 'system' follows the OS setting. Defaults to 'system'. */
  colorScheme?: ColorScheme | 'system';
  /** Replace the built-in light/dark themes. */
  themes?: Partial<Record<ColorScheme, Theme>>;
  /** Host icon pack (e.g. licensed vendor icons), consulted before everything else. */
  icons?: IconResolver;
  /**
   * 'eraser' (default) prefers Eraser's icon artwork — a temporary stand-in,
   * see icons/eraser/NOTICE.md; 'open' uses only the open-source catalog.
   */
  iconSet?: IconSet;
  /** Dot grid behind the diagram. Off by default (plain canvas, like Eraser). */
  grid?: boolean;
  /** Group levels shown expanded below the current focus; deeper groups collapse. */
  expandDepth?: number;
  /** Motion on layout changes. Defaults to 'smooth' ('draw' while streaming). */
  animation?: DiagramAnimation;
  /**
   * Draw the diagram in when it first renders, like Eraser's AI output: the
   * layout is final from the start, groups and boxes appear one by one, then
   * the arrows draw on. Remount (change `key`) to play it again.
   */
  drawIn?: boolean;
  /**
   * Set while `source` is still arriving (e.g. tokens from an AI) and the
   * final text isn't known. Layout is throttled, the camera only zooms out
   * when content spills out of view, and problems on the unfinished last
   * line are not reported. Prefer `drawIn` once the full text is available.
   */
  streaming?: boolean;
  /** Controlled drill-down focus. Omit to let the component manage it. */
  focus?: string | null;
  onFocusChange?: (focus: string | null) => void;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  /**
   * A node with `link:` was clicked. Defaults to opening http(s) links in a
   * new tab; hosts handle their own schemes (e.g. links to other notes).
   */
  onLinkClick?: (href: string, nodeId: string) => void;
  /** Shows an "Ask AI" button in the toolbar; the host opens its assistant with this figure attached. */
  onAskAi?: () => void;
  /**
   * Embedded in a host canvas (a figure): the camera always fits the box (never
   * above 1:1), wheel and drag go to the host, and padding is compact.
   */
  embedded?: boolean;
  /** Overlay controls (toolbar, zoom, flow player). Defaults to true. */
  chrome?: boolean;
  /** Natural size of the diagram including padding, e.g. to size a figure box. */
  onContentSize?: (size: { width: number; height: number }) => void;
  /** Drag nodes to move them and resize selected groups and cards. Defaults to true (architecture diagrams). */
  arrange?: boolean;
  /** Hand placements per drill-down level (controlled); stored by the host, not in the code. */
  placements?: ViewPlacements;
  onPlacementsChange?: (placements: ViewPlacements) => void;
  className?: string;
  style?: CSSProperties;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function openExternalLink(href: string): void {
  if (/^https?:\/\//i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
}

const EXPORT_HINTS: Record<ExportFormat, string> = { png: 'Image', svg: 'Vector', pdf: 'Document', json: 'Eraser JSON', xml: 'Eraser XML' };

const FLOW_STEP_MS = 1800;
const PROPERTY_LABELS: Record<string, string> = { team: 'Team', tech: 'Technology', tags: 'Tags', icon: 'Icon', color: 'Color', shape: 'Shape', link: 'Link', typeface: 'Typeface', colorMode: 'Color mode' };

function stepCaption(step: { from: string; to: string; label?: string }, diagram: { nodes: Map<string, DiagramNode> }): string {
  const name = (id: string) => diagram.nodes.get(id)?.label ?? id;
  return step.label ? `${name(step.from)} → ${name(step.to)}: ${step.label}` : `${name(step.from)} → ${name(step.to)}`;
}

const ZOOM_MIN = 0.1;
/**
 * Padding around an embedded diagram. The host shows the title outside the box
 * (canvas figures: above the border, like Eraser), so the top level has no
 * header; a drilled-in level shows its breadcrumbs and leaves room for them.
 */
const EMBED_PAD = { x: 20, top: 20, crumbsTop: 48, bottom: 20 };
const STREAM_LAYOUT_MS = 900;
// Draw-in pacing: slow enough to follow each component appearing.
const DRAW_IN_NODE_MS = 240;
const DRAW_IN_EDGE_MS = 150;
const ZOOM_MAX = 4;

export function OctoDiagram({
  source,
  colorScheme = 'system',
  themes: themeOverrides,
  icons,
  iconSet = 'eraser',
  grid = false,
  expandDepth,
  animation: animationProp,
  drawIn = false,
  streaming = false,
  focus: controlledFocus,
  onFocusChange,
  onDiagnostics,
  onLinkClick,
  ref,
  type: typeProp = 'auto',
  onSelect,
  renderDetails,
  detailsPanel = true,
  exportMenu = true,
  share,
  onAskAi,
  embedded = false,
  chrome = true,
  onContentSize,
  arrange = true,
  placements: placementsProp,
  onPlacementsChange,
  className,
  style,
}: OctoDiagramProps) {
  const scheme = useResolvedScheme(colorScheme);
  const theme = themeOverrides?.[scheme] ?? themes[scheme];
  const drillMs = theme.motion.drill;

  // Positioned Eraser JSON is rendered as-is; everything else is diagram-as-code.
  const imported = useMemo(() => (looksLikeEraserJson(source) ? importEraserJson(source) : null), [source]);
  const diagramType: DiagramType = imported ? 'flow' : typeProp === 'auto' ? detectDiagramType(source) : typeProp;
  const diagram = useMemo(() => parseDiagram(imported || diagramType !== 'flow' ? '' : source), [imported, diagramType, source]);
  const erd = useMemo(() => (diagramType === 'erd' ? parseErd(source) : null), [diagramType, source]);
  const sequence = useMemo(() => (diagramType === 'sequence' ? parseSequence(source) : null), [diagramType, source]);
  const bpmn = useMemo(() => (diagramType === 'bpmn' ? parseDiagram(source) : null), [diagramType, source]);
  const [erdLayout, setErdLayout] = useState<ErdLayout | null>(null);
  const [uncontrolledFocus, setUncontrolledFocus] = useState<string | null>(null);
  const focus = controlledFocus !== undefined ? controlledFocus : uncontrolledFocus;
  const setFocus = useCallback(
    (next: string | null) => {
      if (controlledFocus === undefined) setUncontrolledFocus(next);
      onFocusChange?.(next);
    },
    [controlledFocus, onFocusChange],
  );

  // Groups the user collapsed into single boxes (everything starts expanded).
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const groupIds = useMemo(() => [...diagram.nodes.values()].filter((n) => n.kind === 'group' && n.children.length > 0).map((n) => n.id), [diagram]);

  const view = useMemo(() => buildView(diagram, { focus, expandDepth, collapsedGroups }), [diagram, focus, expandDepth, collapsedGroups]);
  const embedTopRef = useRef(EMBED_PAD.top);
  embedTopRef.current = focus ? EMBED_PAD.crumbsTop : EMBED_PAD.top;
  const anyExpanded = useMemo(() => [...view.nodes.values()].some((n) => n.kind === 'group'), [view]);
  // Collapsing or expanding everything changes the size a lot, so re-fit afterwards.
  const refitAfterLayout = useRef(false);
  const toggleAll = () => {
    refitAfterLayout.current = true;
    setCollapsedGroups(anyExpanded ? new Set(groupIds) : new Set());
  };
  const drillable = useMemo(() => new Set([...view.nodes.keys()].filter((id) => canDrillInto(view, id))), [view]);

  const animation: DiagramAnimation = animationProp ?? 'smooth';
  useEffect(() => {
    let diagnostics = imported ? imported.diagnostics : erd ? erd.diagnostics : sequence ? sequence.diagnostics : bpmn ? bpmn.diagnostics : diagram.diagnostics;
    if (streaming) {
      // The last line is usually mid-token while streaming; don't flag it.
      const lastLine = source.trimEnd().split('\n').length;
      diagnostics = diagnostics.filter((d) => d.line < lastLine && !/Missing closing '\}'/.test(d.message));
    }
    onDiagnostics?.(diagnostics);
  }, [imported, diagram, erd, sequence, bpmn, onDiagnostics, streaming, source]);

  // The full icon catalog loads in the background; re-render when it lands.
  const [iconEpoch, setIconEpoch] = useState(0);
  useEffect(() => {
    const unsubscribe = onIconCatalogChange(() => setIconEpoch((e) => e + 1));
    loadFullIconCatalog().catch((error: unknown) => console.warn('octodraw: could not load the full icon catalog', error));
    loadVendorIcons().catch((error: unknown) => console.warn('octodraw: could not load vendor icons', error));
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (iconSet === 'eraser') loadEraserIcons().catch((error: unknown) => console.warn('octodraw: could not load Eraser icons', error));
  }, [iconSet]);

  // Node sizes depend on font metrics, so lay out again once web fonts arrive.
  const fontEpoch = useFontEpoch();
  const typography: Typography = useMemo(() => ({ node: theme.text.node, description: theme.text.description, group: theme.text.group, edge: theme.text.edge }), [theme]);

  // The automatic layout; `layout` below adds the user's hand placements.
  const [autoLayout, setLayout] = useState<DiagramLayout | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const lastLayoutAt = useRef(0);
  // ERD tables collapsed to their key columns.
  const [erdCollapsed, setErdCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleTable = useCallback((name: string) => setErdCollapsed((all) => {
    const next = new Set(all);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  }), []);
  // Sequence step-through: the message being explained.
  const [seqStep, setSeqStep] = useState<number | null>(null);
  // Hand placements (dragged nodes, resized groups) for the current drill level.
  const [ownPlacements, setOwnPlacements] = useState<ViewPlacements>({});
  const placements = placementsProp ?? ownPlacements;
  const viewKey = placementKey(view.focus);
  const [dragPlacement, setDragPlacement] = useState<{ id: string; placement: NodePlacement } | null>(null);
  // BPMN elements can be dragged along their lane.
  const bpmnLayout = useMemo(() => {
    if (!bpmn) return null;
    const placed = arrange ? { ...placements[''], ...(dragPlacement ? { [dragPlacement.id]: dragPlacement.placement } : {}) } : undefined;
    return layoutBpmn(bpmn, { measureText: canvasMeasurer(theme.font.sans), typography, placements: placed });
  }, [bpmn, theme, typography, fontEpoch, placements, dragPlacement, arrange]);
  // Participants can be dragged sideways: placements hold their x, and the columns follow that order.
  const sequenceLayout = useMemo(() => {
    if (!sequence) return null;
    const measureText = canvasMeasurer(theme.font.sans);
    const base = layoutSequence(sequence, { measureText });
    const placed = { ...placements[''], ...(dragPlacement ? { [dragPlacement.id]: dragPlacement.placement } : {}) };
    if (!arrange || !Object.keys(placed).length) return base;
    const order = [...base.participants].sort((a, b) => (placed[a.participant.name]?.x ?? a.x) - (placed[b.participant.name]?.x ?? b.x)).map((p) => p.participant.name);
    return layoutSequence(sequence, { measureText, order });
  }, [sequence, theme, fontEpoch, placements, dragPlacement, arrange]);
  useEffect(() => {
    // ERD, sequence and BPMN views hand the camera a size-only layout.
    if (bpmnLayout) {
      setLayout({ width: bpmnLayout.width, height: bpmnLayout.height, nodes: [], edges: [] });
      setLayoutError(null);
      return;
    }
    if (sequenceLayout) {
      setLayout({ width: sequenceLayout.width, height: sequenceLayout.height, nodes: [], edges: [] });
      setLayoutError(null);
      return;
    }
    if (erd) {
      let cancelled = false;
      layoutErd(erd, { theme, measureText: canvasMeasurer(theme.font.sans), collapsed: erdCollapsed })
        .then((next) => {
          if (cancelled) return;
          setErdLayout(next);
          setLayoutError(null);
        })
        .catch((error: unknown) => !cancelled && setLayoutError(String(error)));
      return () => {
        cancelled = true;
      };
    }
    if (imported) {
      setLayout(imported.layout);
      setLayoutError(null);
      return;
    }
    let cancelled = false;
    const run = () => {
      lastLayoutAt.current = Date.now();
      layoutView(view, {
        direction: diagram.settings.direction,
        wrap: diagram.settings.wrap !== 'off',
        typography,
        measureText: canvasMeasurer(fontFamilyFor(theme, diagram.settings.typeface)),
      })
        .then((next) => {
          if (cancelled) return;
          setLayout(next);
          setLayoutError(null);
        })
        .catch((error: unknown) => !cancelled && setLayoutError(String(error)));
    };
    // While streaming, re-layout at most every STREAM_LAYOUT_MS so the picture doesn't churn.
    const wait = streaming ? Math.max(0, STREAM_LAYOUT_MS - (Date.now() - lastLayoutAt.current)) : 0;
    const timer = wait ? window.setTimeout(run, wait) : (run(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imported, erd, erdCollapsed, sequenceLayout, bpmnLayout, view, diagram.settings.direction, diagram.settings.wrap, diagram.settings.typeface, typography, theme, fontEpoch, streaming]);

  /** Alignment guides while dragging a node (layout coordinates). */
  const [snapGuides, setSnapGuides] = useState<SnapResult['guides'] | null>(null);
  const movable = arrange && diagramType === 'flow' && !imported;
  const layout = useMemo(() => {
    if (!autoLayout || !movable) return autoLayout;
    const current = dragPlacement ? { ...placements[viewKey], [dragPlacement.id]: dragPlacement.placement } : placements[viewKey];
    // The automatic layout may still be for the previous view; only arrange when it matches.
    const ids = new Set(autoLayout.nodes.map((n) => n.id));
    if (!view.edges.every((e) => ids.has(e.from) && ids.has(e.to))) return autoLayout;
    return arrangeLayout(view, autoLayout, current, { typography, measureText: canvasMeasurer(fontFamilyFor(theme, diagram.settings.typeface)) });
    // `view` is read for its edges only; autoLayout changes whenever the view does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLayout, movable, placements, viewKey, dragPlacement, typography, theme, diagram.settings.typeface]);
  const commitPlacements = useCallback(
    (next: ViewPlacements) => {
      if (placementsProp === undefined) setOwnPlacements(next);
      onPlacementsChange?.(next);
    },
    [placementsProp, onPlacementsChange],
  );
  const hasPlacements = Object.keys(placements[viewKey] ?? {}).length > 0;
  // ERD tables can be dragged too; relationships re-route as they move.
  const erdMovable = arrange && diagramType === 'erd';
  const arrangedErd = useMemo(() => {
    if (!erd || !erdLayout || !erdMovable) return erdLayout;
    const current = dragPlacement ? { ...placements[''], [dragPlacement.id]: dragPlacement.placement } : placements[''];
    return arrangeErd(erd, erdLayout, current);
  }, [erd, erdLayout, erdMovable, placements, dragPlacement]);
  useEffect(() => {
    if (arrangedErd) setLayout({ width: arrangedErd.width, height: arrangedErd.height, nodes: [], edges: [] });
  }, [arrangedErd]);
  const resetLayout = () => {
    const next = { ...placements };
    delete next[viewKey];
    commitPlacements(next);
  };

  // Draw-in: reveal groups and nodes one at a time, then the edges.
  const [revealCount, setRevealCount] = useState<number | undefined>(drawIn ? 0 : undefined);
  const drawInStarted = useRef(false);
  // Boxes first, then the lines: groups and nodes then edges; tables then relationships; participants then messages.
  const drawCounts = bpmnLayout ? [bpmnLayout.elements.length, bpmnLayout.edges.length] : arrangedErd ? [arrangedErd.tables.length, arrangedErd.links.length] : sequenceLayout ? [sequenceLayout.participants.length, sequenceLayout.messages.length] : layout ? [layout.nodes.length, layout.edges.length] : [0, 0];
  const drawCountsRef = useRef(drawCounts);
  drawCountsRef.current = drawCounts;
  const drawTimer = useRef(0);
  useEffect(() => {
    if (!drawIn || drawInStarted.current || drawCounts[0] === 0) return;
    drawInStarted.current = true;
    let count = 0;
    // Keyed on the box count, not the layout object, so re-layouts (fonts loading, a resize) don't cancel the reveal.
    const step = () => {
      const [boxes, lines] = drawCountsRef.current as [number, number];
      count += 1;
      setRevealCount(count >= boxes + lines ? undefined : count);
      if (count < boxes + lines) drawTimer.current = window.setTimeout(step, count < boxes ? DRAW_IN_NODE_MS : DRAW_IN_EDGE_MS);
    };
    drawTimer.current = window.setTimeout(step, DRAW_IN_NODE_MS);
    // Only re-runs when the number of boxes changes (or StrictMode's extra mount); start over then.
    return () => {
      window.clearTimeout(drawTimer.current);
      drawInStarted.current = false;
    };
  }, [drawIn, drawCounts[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Camera ---------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const [animate, setAnimate] = useState(false);
  const [contentOpacity, setContentOpacity] = useState(1);
  const pendingEntry = useRef<{ kind: 'fit' } | { kind: 'from-rect'; id: string } | null>({ kind: 'fit' });
  const busy = useRef(false);

  // Re-fit when the structure of the view changes wholesale; plain edits keep the camera.
  const lastExpandDepth = useRef(expandDepth);
  if (lastExpandDepth.current !== expandDepth) {
    lastExpandDepth.current = expandDepth;
    pendingEntry.current = { kind: 'fit' };
  }

  const viewport = useCallback(() => {
    const el = containerRef.current;
    return { width: el?.clientWidth || 800, height: el?.clientHeight || 600 };
  }, []);

  const fitRect = useCallback(
    (rect: Rect, padding = 56, maxScale = 1.25): Transform => {
      const { width, height } = viewport();
      if (embedded) {
        // Compact padding (room for the breadcrumbs when drilled in); never enlarge past 1:1.
        const top = embedTopRef.current;
        const k = clamp(Math.min((width - EMBED_PAD.x * 2) / Math.max(rect.width, 1), (height - top - EMBED_PAD.bottom) / Math.max(rect.height, 1), 1), ZOOM_MIN, ZOOM_MAX);
        return { k, x: width / 2 - (rect.x + rect.width / 2) * k, y: top + (height - top - EMBED_PAD.bottom) / 2 - (rect.y + rect.height / 2) * k };
      }
      const k = clamp(Math.min((width - padding * 2) / Math.max(rect.width, 1), (height - padding * 2) / Math.max(rect.height, 1), maxScale), ZOOM_MIN, ZOOM_MAX);
      return { k, x: width / 2 - (rect.x + rect.width / 2) * k, y: height / 2 - (rect.y + rect.height / 2) * k };
    },
    [viewport, embedded],
  );

  const contentSizeRef = useRef(onContentSize);
  contentSizeRef.current = onContentSize;
  useEffect(() => {
    if (layout) contentSizeRef.current?.({ width: Math.ceil(layout.width + EMBED_PAD.x * 2), height: Math.ceil(layout.height + embedTopRef.current + EMBED_PAD.bottom) });
  }, [layout]);

  // True while the camera shows the whole diagram as fitted (not panned or zoomed by the user),
  // so resizing the canvas re-fits instead of cutting the diagram off.
  const fitted = useRef(true);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const fitAll = useCallback(() => {
    if (!layout) return;
    fitted.current = true;
    setAnimate(true);
    setTransform(fitRect({ x: 0, y: 0, width: layout.width, height: layout.height }));
  }, [layout, fitRect]);

  useEffect(() => {
    if (!layout || !refitAfterLayout.current) return;
    refitAfterLayout.current = false;
    fitted.current = true;
    setAnimate(true);
    setTransform(fitRect({ x: 0, y: 0, width: layout.width, height: layout.height }));
  }, [layout, fitRect]);

  // While streaming, keep the growing diagram in view until the user takes over the camera.
  const userMovedCamera = useRef(false);
  useEffect(() => {
    if (streaming) userMovedCamera.current = false;
  }, [streaming]);
  useEffect(() => {
    if (!streaming || !layout || pendingEntry.current || userMovedCamera.current) return;
    // Only zoom out, and only when the diagram no longer fits; otherwise hold still.
    const { width, height } = viewport();
    const t = transformRef.current;
    const fits = t.x >= 0 && t.y >= 0 && t.x + layout.width * t.k <= width && t.y + layout.height * t.k <= height;
    if (fits) return;
    const fitted = fitRect({ x: 0, y: 0, width: layout.width, height: layout.height }, 56, 1);
    setAnimate(true);
    setTransform(fitted.k < t.k ? fitted : { ...fitted, k: t.k, x: width / 2 - (layout.width / 2) * t.k, y: height / 2 - (layout.height / 2) * t.k });
  }, [streaming, layout, fitRect, viewport]);

  const entryFrame = useRef(0);

  // Entry animation once a new level's layout is ready.
  useLayoutEffect(() => {
    const entry = pendingEntry.current;
    if (!layout || !entry) return;
    pendingEntry.current = null;
    fitted.current = true;
    const target = fitRect({ x: 0, y: 0, width: layout.width, height: layout.height });
    const origin = entry.kind === 'from-rect' ? layout.nodes.find((n) => n.id === entry.id) : undefined;
    setAnimate(false);
    if (origin) {
      // Coming back up: start zoomed into the group we left, then pull out.
      setTransform(fitRect(origin, 24, ZOOM_MAX));
    } else {
      setTransform({ k: target.k * 0.94, x: target.x + layout.width * target.k * 0.03, y: target.y + layout.height * target.k * 0.03 });
    }
    setContentOpacity(origin ? 1 : 0);
    // Not cancelled when the layout changes again: while streaming, layouts
    // arrive faster than two frames, and cancelling would leave the content hidden.
    entryFrame.current = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnimate(true);
        // Fit again now: the box may have been resized meanwhile (e.g. an embedded figure sizing itself).
        const current = layoutRef.current;
        setTransform(fitted.current && current ? fitRect({ x: 0, y: 0, width: current.width, height: current.height }) : target);
        setContentOpacity(1);
        window.setTimeout(() => (busy.current = false), drillMs);
      }),
    );
  }, [layout, fitRect, drillMs]);
  useEffect(() => () => cancelAnimationFrame(entryFrame.current), []);

  const drillInto = useCallback(
    (id: string) => {
      if (busy.current || !layout) return;
      const node = layout.nodes.find((n) => n.id === id);
      busy.current = true;
      setHovered(null);
      setAnimate(true);
      if (node) setTransform(fitRect(node, 24, ZOOM_MAX));
      fitted.current = false;
      setContentOpacity(0);
      window.setTimeout(() => {
        pendingEntry.current = { kind: 'fit' };
        setFocus(id);
      }, drillMs * 0.8);
    },
    [layout, fitRect, setFocus, drillMs],
  );

  const goTo = useCallback(
    (target: string | null) => {
      if (busy.current || target === view.focus) return;
      busy.current = true;
      // When going up, zoom out from the child of `target` that we came through.
      const child = view.path[view.path.indexOf(target ?? '') - 1] ?? view.path.at(-1);
      pendingEntry.current = child ? { kind: 'from-rect', id: child } : { kind: 'fit' };
      setAnimate(true);
      setContentOpacity(0.4);
      setFocus(target);
    },
    [view, setFocus],
  );

  const goUp = useCallback(() => {
    if (view.focus) goTo(view.path[1] ?? null);
  }, [view, goTo]);

  // On resize (e.g. the host opens a side panel): re-fit a fitted camera, otherwise keep the same point centered.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let size = { width: el.clientWidth, height: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      const dx = (next.width - size.width) / 2;
      const dy = (next.height - size.height) / 2;
      size = next;
      if (!dx && !dy) return;
      setAnimate(false);
      const current = layoutRef.current;
      if (fitted.current && current && !pendingEntry.current) setTransform(fitRect({ x: 0, y: 0, width: current.width, height: current.height }));
      else setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitRect]);

  // Wheel: pinch / ctrl+wheel zooms around the cursor, plain wheel pans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || embedded) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userMovedCamera.current = true;
      fitted.current = false;
      setAnimate(false);
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setTransform((t) => {
        if (event.ctrlKey || event.metaKey) {
          const k = clamp(t.k * Math.exp(-event.deltaY * 0.01), ZOOM_MIN, ZOOM_MAX);
          return { k, x: px - ((px - t.x) / t.k) * k, y: py - ((py - t.y) / t.k) * k };
        }
        return { ...t, x: t.x - event.deltaX, y: t.y - event.deltaY };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [embedded]);

  // Touch: two fingers pinch to zoom (and pan) around their midpoint.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mid: { x: number; y: number }; t: { x: number; y: number; k: number } } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || embedded) return;
    const local = (p: { x: number; y: number }) => {
      const rect = el.getBoundingClientRect();
      return { x: p.x - rect.left, y: p.y - rect.top };
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size !== 2) return;
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      // A second finger turns a pan or node drag into a pinch.
      drag.current = null;
      nodeDrag.current = null;
      setDragPlacement(null);
      pinch.current = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), t: transformRef.current };
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = pinch.current;
      if (!start || touches.current.size < 2) return;
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const mid = local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const k = clamp(start.t.k * (Math.hypot(a.x - b.x, a.y - b.y) / start.d), ZOOM_MIN, ZOOM_MAX);
      const wx = (start.mid.x - start.t.x) / start.t.k;
      const wy = (start.mid.y - start.t.y) / start.t.k;
      userMovedCamera.current = true;
      fitted.current = false;
      setAnimate(false);
      setTransform({ k, x: mid.x - wx * k, y: mid.y - wy * k });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.current.delete(event.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; active: boolean } | null>(null);
  // Dragging a node moves it; dragging the corner handle of a selected group or card resizes it.
  const nodeDrag = useRef<{ id: string; x: number; y: number; origin: NodePlacement; mode: 'move' | 'resize'; active: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent) => {
    const target = event.target as Element;
    if (pinch.current) return;
    if (event.button === 0 && arrange && bpmnLayout) {
      const id = target.closest('[data-node-id]')?.getAttribute('data-node-id');
      const el = id ? bpmnLayout.elements.find((e) => e.id === id) : undefined;
      if (el) {
        nodeDrag.current = { id: el.id, x: event.clientX, y: event.clientY, origin: { x: el.x, y: el.y }, mode: 'move', active: false };
        return;
      }
    }
    if (event.button === 0 && arrange && sequenceLayout) {
      const id = target.closest('[data-node-id]')?.getAttribute('data-node-id');
      const p = id ? sequenceLayout.participants.find((q) => q.participant.name === id) : undefined;
      if (p) {
        nodeDrag.current = { id: p.participant.name, x: event.clientX, y: event.clientY, origin: { x: p.x, y: 0 }, mode: 'move', active: false };
        return;
      }
    }
    if (event.button === 0 && erdMovable && arrangedErd && !target.closest('.od-action')) {
      const id = target.closest('[data-node-id]')?.getAttribute('data-node-id');
      const table = id ? arrangedErd.tables.find((t) => t.entity.name === id) : undefined;
      if (table) {
        nodeDrag.current = { id: table.entity.name, x: event.clientX, y: event.clientY, origin: { x: table.x, y: table.y }, mode: 'move', active: false };
        return;
      }
    }
    if (event.button === 0 && movable && layout && !target.closest('.od-expand, .od-action, .od-link')) {
      const resizeId = target.closest('[data-resize-for]')?.getAttribute('data-resize-for');
      const id = resizeId ?? target.closest('[data-node-id]')?.getAttribute('data-node-id');
      const node = id ? layout.nodes.find((n) => n.id === id) : undefined;
      if (node && node.kind !== 'external') {
        const off = layout.offset ?? { x: 0, y: 0 };
        nodeDrag.current = { id: node.id, x: event.clientX, y: event.clientY, origin: { x: node.x - off.x, y: node.y - off.y, width: node.width, height: node.height }, mode: resizeId ? 'resize' : 'move', active: false };
        return;
      }
    }
    if (event.button !== 0 || embedded || target.closest('.od-expand')) return;
    drag.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, active: false };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (pinch.current) return;
    const nd = nodeDrag.current;
    if (nd) {
      if (!nd.active) {
        if (Math.hypot(event.clientX - nd.x, event.clientY - nd.y) < 3) return;
        nd.active = true;
        setHovered(null);
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
      }
      const dx = (event.clientX - nd.x) / transform.k;
      const dy = (event.clientY - nd.y) / transform.k;
      const saved = placements[viewKey]?.[nd.id];
      let placement: NodePlacement =
        nd.mode === 'move'
          ? { ...saved, x: Math.round(nd.origin.x + dx), y: Math.round(nd.origin.y + dy) }
          : { x: nd.origin.x, y: nd.origin.y, width: Math.max(48, Math.round(nd.origin.width! + dx)), height: Math.max(32, Math.round(nd.origin.height! + dy)) };
      // Snap edges and centres to the other boxes on this level (Alt places freely).
      if (layout && !event.altKey) {
        const off = layout.offset ?? { x: 0, y: 0 };
        const skip = new Set([nd.id]);
        // Not to its own children (they move with it) or the groups around it (they grow around it).
        for (const n of layout.nodes) if (n.parent && skip.has(n.parent)) skip.add(n.id);
        for (let p = layout.nodes.find((n) => n.id === nd.id)?.parent; p; p = layout.nodes.find((n) => n.id === p)?.parent) skip.add(p);
        const others = layout.nodes.filter((n) => !skip.has(n.id) && n.kind !== 'external').map((n) => ({ x: n.x - off.x, y: n.y - off.y, w: n.width, h: n.height }));
        const w = placement.width ?? nd.origin.width!;
        const h = placement.height ?? nd.origin.height!;
        const r = snapBox({ x: placement.x, y: placement.y, w, h }, others, 6 / transform.k, nd.mode === 'move' ? undefined : { x: true, y: true });
        if (nd.mode === 'move') placement = { ...placement, x: placement.x + r.dx, y: placement.y + r.dy };
        else placement = { ...placement, width: Math.max(48, w + r.dx), height: Math.max(32, h + r.dy) };
        const shift = (g: SnapResult['guides']) => ({
          x: g.x && { at: g.x.at + off.x, from: g.x.from + off.y, to: g.x.to + off.y },
          y: g.y && { at: g.y.at + off.y, from: g.y.from + off.x, to: g.y.to + off.x },
        });
        setSnapGuides(r.guides.x || r.guides.y ? shift(r.guides) : null);
      }
      setDragPlacement({ id: nd.id, placement });
      return;
    }
    const d = drag.current;
    if (!d) {
      if (busy.current) return;
      const target = event.target as Element;
      const id = target.closest('[data-expand-for]')?.getAttribute('data-expand-for') ?? target.closest('[data-drill-id]')?.getAttribute('data-drill-id') ?? null;
      if (id !== hovered) setHovered(id);
      return;
    }
    if (!d.active) {
      // Capture only once the pointer really moves; capturing on pointerdown
      // would retarget the clicks that make up a double-click to the <svg>.
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < 3) return;
      d.active = true;
      userMovedCamera.current = true;
      fitted.current = false;
      setDragging(true);
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    setAnimate(false);
    setTransform((t) => ({ ...t, x: d.tx + event.clientX - d.x, y: d.ty + event.clientY - d.y }));
  };
  const panned = useRef(false);
  const onPointerUp = () => {
    const nd = nodeDrag.current;
    nodeDrag.current = null;
    setSnapGuides(null);
    if (nd?.active) {
      panned.current = true;
      if (dragPlacement) commitPlacements({ ...placements, [viewKey]: { ...placements[viewKey], [dragPlacement.id]: dragPlacement.placement } });
      setDragPlacement(null);
      return;
    }
    panned.current = !!drag.current?.active;
    drag.current = null;
    setDragging(false);
  };
  // Clicking empty canvas clears the selection (but not at the end of a pan).
  const onCanvasClick = () => {
    if (!panned.current) select(null);
    panned.current = false;
  };

  const zoomTo = (k: number) => {
    fitted.current = false;
    const { width, height } = viewport();
    setAnimate(true);
    setTransform((t) => {
      const next = clamp(k, ZOOM_MIN, ZOOM_MAX);
      return { k: next, x: width / 2 - ((width / 2 - t.x) / t.k) * next, y: height / 2 - ((height / 2 - t.y) / t.k) * next };
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape' && (anyMenuOpen || exportOpen)) {
      event.preventDefault();
      closeMenus();
    } else if (event.key === 'Escape' && (selected || flow)) {
      event.preventDefault();
      if (selected) select(null);
      else stopFlow();
    } else if (event.key === 'Escape' && seqStep !== null) {
      event.preventDefault();
      setSeqStep(null);
    } else if (seqStep !== null && sequenceLayout && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      setSeqStep(Math.max(0, Math.min(sequenceLayout.messages.length - 1, seqStep + (event.key === 'ArrowRight' ? 1 : -1))));
    } else if (flow && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      setPlaying(false);
      stepFlow(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      goUp();
    } else if (event.key === '0' || (event.shiftKey && event.key === '!')) {
      fitAll();
    } else if (event.key === '=' || event.key === '+') {
      zoomTo(transform.k * 1.2);
    } else if (event.key === '-') {
      zoomTo(transform.k / 1.2);
    }
  };

  const [zoomMenu, setZoomMenu] = useState(false);
  const setExportOpenRef = useRef<(open: boolean) => void>(() => {});

  // --- Maps: selection, filters, flows ------------------------------------------
  const [selected, setSelectedState] = useState<string | null>(null);
  const select = useCallback(
    (id: string | null) => {
      setSelectedState(id);
      onSelect?.(id);
    },
    [onSelect],
  );
  const facets = useMemo(() => facetValues(diagram), [diagram]);
  const hasFacets = FACETS.some((f) => facets[f.name].length > 0);
  const [filter, setFilter] = useState<MapFilter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const toggleFilter = (facet: FacetName, value: string) => setFilter((f) => ({ ...f, [facet]: f[facet] === value ? undefined : value }));

  const flows = diagram.flows.filter((f) => f.steps.length > 0);
  const [flowIndex, setFlowIndex] = useState<number | null>(null);
  const [flowStep, setFlowStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const flow = flowIndex !== null ? flows[flowIndex] : undefined;
  const startFlow = (index: number) => {
    setFlowIndex(index);
    setFlowStep(0);
    setPlaying(true);
  };
  const stopFlow = () => {
    setFlowIndex(null);
    setPlaying(false);
  };
  const stepFlow = useCallback(
    (delta: number) => {
      if (!flow) return;
      setFlowStep((s) => Math.min(flow.steps.length - 1, Math.max(0, s + delta)));
    },
    [flow],
  );
  useEffect(() => {
    if (!playing || !flow) return;
    if (flowStep >= flow.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setFlowStep((s) => s + 1), FLOW_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, flow, flowStep]);
  // Flows reset when the diagram changes shape.
  useEffect(() => {
    if (flowIndex !== null && !flows[flowIndex]) stopFlow();
  }, [flows, flowIndex]);

  const emphasis = useMemo(
    () => (flow ? flowEmphasis(view, diagram, flow, Math.min(flowStep, flow.steps.length - 1)) : filterEmphasis(view, diagram, filter)),
    [flow, flowStep, view, diagram, filter],
  );
  const selectedNode = selected ? diagram.nodes.get(selected) : undefined;

  // Toolbar menus close on any outside press or Escape.
  const anyMenuOpen = zoomMenu || filterOpen;
  const closeMenus = useCallback(() => {
    setZoomMenu(false);
    setFilterOpen(false);
    setExportOpenRef.current(false);
  }, []);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.('.od-menu-anchor')) closeMenus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [closeMenus]);

  // --- Export -----------------------------------------------------------------
  const exportTitle = imported?.title || erd?.settings.title || sequence?.settings.title || bpmn?.settings.title || diagram.settings.title || undefined;
  const interactive = !!(detailsPanel || onSelect);
  const otherBody =
    erd && arrangedErd ? (
      <ErdSvg layout={arrangedErd} diagram={erd} theme={theme} icons={icons} iconSet={iconSet} reveal={revealCount} focus={selected} onSelect={
          interactive
            ? (name) => {
                // The click that ends a table drag isn't a selection.
                if (panned.current) {
                  panned.current = false;
                  return;
                }
                select(selected === name ? null : name);
              }
            : undefined
        } onToggle={chrome ? toggleTable : undefined} />
    ) : sequence && sequenceLayout ? (
      <SequenceSvg
        layout={sequenceLayout}
        styleMode={sequence.settings.styleMode}
        theme={theme}
        icons={icons}
        iconSet={iconSet}
        reveal={revealCount}
        current={seqStep}
        focus={selected}
        onSelect={
          interactive
            ? (name) => {
                if (panned.current) {
                  panned.current = false;
                  return;
                }
                select(selected === name ? null : name);
              }
            : undefined
        }
      />
    ) : bpmnLayout ? (
      <BpmnSvg layout={bpmnLayout} styleMode={bpmn?.settings.styleMode} theme={theme} icons={icons} iconSet={iconSet} reveal={revealCount} />
    ) : undefined;
  // Exports show the whole diagram, without selection or step highlighting.
  const exportBody = erd && arrangedErd ? <ErdSvg layout={arrangedErd} diagram={erd} theme={theme} icons={icons} iconSet={iconSet} /> : sequence && sequenceLayout ? <SequenceSvg layout={sequenceLayout} styleMode={sequence.settings.styleMode} theme={theme} icons={icons} iconSet={iconSet} /> : bpmnLayout ? <BpmnSvg layout={bpmnLayout} styleMode={bpmn?.settings.styleMode} theme={theme} icons={icons} iconSet={iconSet} /> : undefined;
  const fileBase = (exportTitle ?? 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
  const renderSvg = useCallback(
    async ({ embedFonts = true, title = true }: { embedFonts?: boolean; title?: boolean } = {}) => {
      if (!layout) throw new Error('The diagram has not been laid out yet');
      const fontCss = embedFonts ? await collectFontCss([fontFamilyFor(theme, diagram.settings.typeface), theme.font.sans]) : undefined;
      return renderDiagramSvg({ layout, settings: diagram.settings, theme, icons, iconSet, title: title ? exportTitle : undefined, fontCss, body: exportBody });
    },
    [layout, theme, diagram.settings, icons, iconSet, exportTitle, exportBody],
  );
  const handle = useMemo<OctoDiagramHandle>(() => {
    const api: OctoDiagramHandle = {
      exportSvg: async (options) => (await renderSvg(options)).svg,
      exportPng: async ({ scale = 2 } = {}) => {
        const { svg, width, height } = await renderSvg();
        return svgToPng(svg, width, height, scale);
      },
      exportPdf: async () => {
        // jsPDF can't use web fonts from CSS, so render without them.
        const { svg, width, height } = await renderSvg({ embedFonts: false });
        return svgToPdf(svg, width, height);
      },
      exportJson: () => (layout ? exportEraserJson(layout, { title: exportTitle }) : ''),
      exportXml: () => (layout ? exportEraserXml(layout, { title: exportTitle }) : ''),
      download: async (format, filename = `${fileBase}.${format}`) => {
        const blob =
          format === 'png' ? await api.exportPng()
          : format === 'pdf' ? await api.exportPdf()
          : format === 'svg' ? new Blob([await api.exportSvg()], { type: 'image/svg+xml' })
          : format === 'json' ? new Blob([api.exportJson()], { type: 'application/json' })
          : new Blob([api.exportXml()], { type: 'application/xml' });
        downloadBlob(blob, filename);
      },
      copy: async (format) => {
        if (format === 'png') return copyBlob(await api.exportPng());
        if (format === 'svg') return copyText(await api.exportSvg());
        if (format === 'json') return copyText(api.exportJson());
        if (format === 'xml') return copyText(api.exportXml());
        if (!share) throw new Error('No share URL was provided');
        const snippets = embedSnippets({ ...share, title: exportTitle });
        return copyText(format === 'link' ? snippets.link : format === 'markdown' ? snippets.markdown : snippets.html);
      },
    };
    return api;
  }, [renderSvg, layout, exportTitle, fileBase, share]);
  useImperativeHandle(ref, () => handle, [handle]);

  const [exportOpen, setExportOpen] = useState(false);
  setExportOpenRef.current = setExportOpen;
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const runExport = (label: string, action: () => Promise<void>) => {
    setExportOpen(false);
    action().then(
      () => setToast(label),
      (error: unknown) => setToast(`Couldn't ${label.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`),
    );
  };
  const crumbs = [{ id: null as string | null, label: exportTitle || 'Overview' }, ...[...view.path].reverse().map((id) => ({ id, label: diagram.nodes.get(id)?.label ?? id }))];
  const current = view.focus ? diagram.nodes.get(view.focus) : undefined;
  const subtitle = current?.properties.description;
  const cssVars = useMemo(() => themeCssVariables(theme) as CSSProperties, [theme]);

  return (
    <div
      ref={containerRef}
      className={`od-root${className ? ` ${className}` : ''}`}
      data-color-scheme={scheme}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ ...cssVars, position: 'relative', overflow: 'hidden', background: theme.color.canvas, outline: 'none', fontFamily: theme.font.sans, touchAction: embedded ? 'auto' : 'none', colorScheme: scheme, ...style }}
    >
      <style>{CSS}</style>
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block', cursor: dragging ? 'grabbing' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onCanvasClick}
        onPointerLeave={() => setHovered(null)}
      >
        {grid && (
          <>
            <defs>
              <pattern id="od-grid" width={20 * transform.k} height={20 * transform.k} patternUnits="userSpaceOnUse" x={transform.x} y={transform.y}>
                <circle cx={1} cy={1} r={Math.max(0.6, transform.k * 0.8)} fill={theme.color.grid} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#od-grid)" />
          </>
        )}
        <g
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            transformOrigin: '0 0',
            opacity: contentOpacity,
            transition: animate ? `transform ${drillMs}ms ${theme.motion.ease}, opacity ${drillMs * 0.8}ms ease` : 'none',
          }}
        >
          {otherBody}
          {layout && diagramType === 'flow' && <DiagramSvg layout={layout} settings={diagram.settings} theme={theme} drillable={drillable} onDrill={drillInto} onToggleCollapse={toggleCollapsed} onLink={onLinkClick ?? openExternalLink} onSelect={detailsPanel || onSelect ? select : undefined} selected={selected} emphasis={emphasis} icons={icons} hovered={hovered} animation={dragPlacement ? 'none' : animation} revealCount={revealCount} iconEpoch={iconEpoch} iconSet={iconSet} zoom={transform.k} />}
          {snapGuides?.x && <line x1={snapGuides.x.at} y1={snapGuides.x.from - 8} x2={snapGuides.x.at} y2={snapGuides.x.to + 8} stroke={theme.palette.pink.solid} strokeWidth={1 / transform.k} pointerEvents="none" />}
          {snapGuides?.y && <line x1={snapGuides.y.from - 8} y1={snapGuides.y.at} x2={snapGuides.y.to + 8} y2={snapGuides.y.at} stroke={theme.palette.pink.solid} strokeWidth={1 / transform.k} pointerEvents="none" />}
          {layout && diagramType === 'flow' && movable && selected && !dragPlacement && (() => {
            const n = layout.nodes.find((node) => node.id === selected);
            if (!n || !canResizeNode(n)) return null;
            const size = 10 / transform.k;
            return <rect className="od-resize" data-resize-for={n.id} x={n.x + n.width - size / 2} y={n.y + n.height - size / 2} width={size} height={size} rx={2 / transform.k} fill={theme.color.raised} stroke={theme.color.accent} strokeWidth={1.5 / transform.k} />;
          })()}
        </g>
      </svg>

      {!(embedded && !view.focus) && <header className="od-header">
        <nav className="od-crumbs" aria-label="Diagram levels">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={crumb.id ?? '__root__'} className="od-crumb-item">
                {i > 0 && <span className="od-crumb-sep">/</span>}
                {last ? (
                  <span className="od-crumb od-crumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <button type="button" className="od-crumb" onClick={() => goTo(crumb.id)}>
                    {crumb.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {subtitle && <p className="od-subtitle">{subtitle}</p>}
      </header>}

      {isFilterActive(filter) && !flow && (
        <div className="od-chips">
          {FACETS.filter((f) => filter[f.name]).map((f) => (
            <button key={f.name} type="button" className="od-chip" onClick={() => toggleFilter(f.name, filter[f.name]!)} title="Remove filter">
              {f.label}: {filter[f.name]} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {chrome && <div className="od-toolbar">
        {hasFacets && (
          <div className="od-menu-anchor">
            <button type="button" className="od-tool" onClick={() => setFilterOpen((o) => !o)} aria-haspopup="menu" aria-expanded={filterOpen} title="Highlight one team, technology or tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
              Filter
              {isFilterActive(filter) && <span className="od-count">{Object.values(filter).filter(Boolean).length}</span>}
            </button>
            {filterOpen && (
              <div className="od-menu od-filter-menu" role="menu">
                {FACETS.filter((f) => facets[f.name].length > 0).map((f) => (
                  <div key={f.name}>
                    <div className="od-menu-label">{f.label}</div>
                    <div className="od-chip-row">
                      {facets[f.name].map((value) => (
                        <button key={value} type="button" className="od-chip" aria-pressed={filter[f.name] === value} onClick={() => toggleFilter(f.name, value)}>
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {isFilterActive(filter) && (
                  <button type="button" role="menuitem" className="od-menu-clear" onClick={() => setFilter({})}>
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {exportMenu && (
          <div className="od-menu-anchor">
            <button type="button" className="od-tool" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportOpen} title="Export or copy this diagram">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 15V3m0 12-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              Export
            </button>
            {exportOpen && (
              <div className="od-menu od-export-menu" role="menu">
                <div className="od-menu-label">Download</div>
                {(diagramType === 'flow' ? (['png', 'svg', 'pdf', 'json', 'xml'] as const) : (['png', 'svg', 'pdf'] as const)).map((format) => (
                  <button key={format} type="button" role="menuitem" onClick={() => runExport(`Downloaded ${format.toUpperCase()}`, () => handle.download(format))}>
                    {format.toUpperCase()}
                    <kbd>{EXPORT_HINTS[format]}</kbd>
                  </button>
                ))}
                <div className="od-menu-label">Copy to clipboard</div>
                {(diagramType === 'flow' ? (['png', 'svg', 'json', 'xml'] as const) : (['png', 'svg'] as const)).map((format) => (
                  <button key={format} type="button" role="menuitem" onClick={() => runExport(`Copied ${format.toUpperCase()}`, () => handle.copy(format))}>
                    {format.toUpperCase()}
                    <kbd>{EXPORT_HINTS[format]}</kbd>
                  </button>
                ))}
                {share && (
                  <>
                    <div className="od-menu-label">Share</div>
                    <button type="button" role="menuitem" onClick={() => runExport('Copied link', () => handle.copy('link'))}>Link</button>
                    <button type="button" role="menuitem" onClick={() => runExport('Copied Markdown embed', () => handle.copy('markdown'))}>Markdown embed</button>
                    <button type="button" role="menuitem" onClick={() => runExport('Copied HTML embed', () => handle.copy('html'))}>HTML embed</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {onAskAi && (
          <button type="button" className="od-tool" onClick={onAskAi} title="Ask the assistant to change this diagram">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            </svg>
            Ask AI
          </button>
        )}

        {hasPlacements && (movable || erdMovable || (arrange && (!!sequence || !!bpmn))) && (
          <button type="button" className="od-tool" onClick={resetLayout} title="Put every node back where the automatic layout places it">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
            </svg>
            Reset layout
          </button>
        )}
        {erd && erdLayout && erd.entities.size > 0 && (
          <button
            type="button"
            className="od-tool"
            onClick={() => setErdCollapsed(erdCollapsed.size ? new Set() : new Set(erd.entities.keys()))}
            title={erdCollapsed.size ? 'Show every column' : 'Show only key columns in every table'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {erdCollapsed.size ? <path d="m7 15 5 5 5-5M7 9l5-5 5 5" /> : <path d="m7 20 5-5 5 5M7 4l5 5 5-5" />}
            </svg>
            {erdCollapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {groupIds.length > 0 && !imported && (
          <button type="button" className="od-tool" onClick={toggleAll} title={anyExpanded ? 'Collapse every group into a single box' : 'Show the contents of every group'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {anyExpanded ? <path d="m7 20 5-5 5 5M7 4l5 5 5-5" /> : <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />}
            </svg>
            {anyExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}

        <div className="od-menu-anchor">
          <button type="button" className="od-zoom-trigger" onClick={() => setZoomMenu((open) => !open)} aria-haspopup="menu" aria-expanded={zoomMenu}>
            {Math.round(transform.k * 100)}%
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 4l3 3 3-3" fill="currentColor" />
            </svg>
          </button>
          {zoomMenu && (
            <div className="od-menu" role="menu" onClick={() => setZoomMenu(false)}>
              <button type="button" role="menuitem" onClick={() => zoomTo(transform.k * 1.2)}>
                Zoom in <kbd>+</kbd>
              </button>
              <button type="button" role="menuitem" onClick={() => zoomTo(transform.k / 1.2)}>
                Zoom out <kbd>−</kbd>
              </button>
              <button type="button" role="menuitem" onClick={fitAll}>
                Zoom to fit <kbd>0</kbd>
              </button>
              <button type="button" role="menuitem" onClick={() => zoomTo(1)}>
                Zoom to 100%
              </button>
            </div>
          )}
        </div>
      </div>}

      {chrome && sequenceLayout && sequenceLayout.messages.length > 1 && revealCount === undefined && (
        <div className={`od-player${seqStep !== null ? ' od-player-active' : ''}`} role="group" aria-label="Step through">
          {seqStep !== null ? (
            <>
              <button type="button" className="od-player-btn" onClick={() => setSeqStep(Math.max(0, seqStep - 1))} disabled={seqStep === 0} aria-label="Previous message">
                ‹
              </button>
              <button type="button" className="od-player-btn" onClick={() => setSeqStep(Math.min(sequenceLayout.messages.length - 1, seqStep + 1))} disabled={seqStep >= sequenceLayout.messages.length - 1} aria-label="Next message">
                ›
              </button>
              <span className="od-player-count">
                {seqStep + 1} / {sequenceLayout.messages.length}
              </span>
              <span className="od-player-caption">{sequenceLayout.messages[seqStep]!.label || 'Message'}</span>
              <button type="button" className="od-player-btn" onClick={() => setSeqStep(null)} aria-label="Stop stepping">
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              className="od-player-start"
              onClick={() => {
                setSeqStep(0);
                // The button goes away; keep arrow keys working.
                containerRef.current?.focus({ preventScroll: true });
              }}
            >
              ▶ Step through
              <span className="od-player-hint">{sequenceLayout.messages.length} messages</span>
            </button>
          )}
        </div>
      )}

      {chrome && flows.length > 0 && (
        <div className={`od-player${flow ? ' od-player-active' : ''}`} role="group" aria-label="Flows">
          {flow ? (
            <>
              <select className="od-player-select" value={flowIndex ?? 0} onChange={(e) => startFlow(Number(e.target.value))} aria-label="Flow">
                {flows.map((f, i) => (
                  <option key={f.name} value={i}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button type="button" className="od-player-btn" onClick={() => stepFlow(-1)} disabled={flowStep === 0} aria-label="Previous step">
                ‹
              </button>
              <button type="button" className="od-player-btn" onClick={() => (flowStep >= flow.steps.length - 1 ? startFlow(flowIndex!) : setPlaying((p) => !p))} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button type="button" className="od-player-btn" onClick={() => stepFlow(1)} disabled={flowStep >= flow.steps.length - 1} aria-label="Next step">
                ›
              </button>
              <span className="od-player-count">
                {flowStep + 1} / {flow.steps.length}
              </span>
              <span className="od-player-caption">{stepCaption(flow.steps[flowStep]!, diagram)}</span>
              <button type="button" className="od-player-btn" onClick={stopFlow} aria-label="Close flow">
                ×
              </button>
            </>
          ) : (
            <button type="button" className="od-player-start" onClick={() => startFlow(0)}>
              ▶ Play flow{flows.length > 1 ? 's' : ''}
              <span className="od-player-hint">{flows.length > 1 ? `${flows.length} flows` : flows[0]!.name}</span>
            </button>
          )}
        </div>
      )}

      {detailsPanel && selectedNode && (
        <aside className="od-panel" aria-label={`Details for ${selectedNode.label}`}>
          <header className="od-panel-header">
            <div>
              <div className="od-panel-kind">{selectedNode.kind === 'group' ? 'Group' : 'Component'}</div>
              <h3>{selectedNode.label}</h3>
            </div>
            <button type="button" className="od-icon-btn" onClick={() => select(null)} aria-label="Close details">
              ×
            </button>
          </header>
          {selectedNode.properties.description && <p className="od-panel-desc">{selectedNode.properties.description}</p>}
          {ancestorsOf(diagram, selectedNode.id).length > 0 && (
            <div className="od-panel-row">
              <span>Inside</span>
              <span>{ancestorsOf(diagram, selectedNode.id).map((id) => diagram.nodes.get(id)?.label ?? id).join(' › ')}</span>
            </div>
          )}
          {Object.entries(selectedNode.properties)
            .filter(([k]) => !['description', 'label'].includes(k))
            .map(([k, v]) => (
              <div className="od-panel-row" key={k}>
                <span>{PROPERTY_LABELS[k] ?? k}</span>
                {k === 'link' ? (
                  <a href={v} target="_blank" rel="noreferrer noopener" onClick={(e) => { if (onLinkClick) { e.preventDefault(); onLinkClick(v, selectedNode.id); } }}>
                    {v}
                  </a>
                ) : (
                  <span>{v}</span>
                )}
              </div>
            ))}
          {(['incoming', 'outgoing'] as const).map((dir) => {
            const list = connectionsOf(diagram, selectedNode.id)[dir];
            if (list.length === 0) return null;
            return (
              <div key={dir} className="od-panel-section">
                <div className="od-menu-label">{dir === 'incoming' ? 'Incoming' : 'Outgoing'}</div>
                {list.map((c, i) => (
                  <button key={i} type="button" className="od-panel-link" onClick={() => select(c.node)}>
                    <span>{dir === 'incoming' ? '←' : '→'} {diagram.nodes.get(c.node)?.label ?? c.node}</span>
                    {c.label && <span className="od-panel-muted">{c.label}</span>}
                  </button>
                ))}
              </div>
            );
          })}
          {renderDetails?.(selectedNode)}
        </aside>
      )}

      {detailsPanel && erd && selected && erd.entities.get(selected) && (() => {
        const entity = erd.entities.get(selected)!;
        const related = erd.relationships.filter((r) => r.from.entity === entity.name || r.to.entity === entity.name);
        const many = (r: (typeof related)[number], end: 'from' | 'to') => (end === 'from' ? r.connector === '>' || r.connector === '<>' : r.connector === '<' || r.connector === '<>');
        return (
          <aside className="od-panel" aria-label={`Details for ${entity.label}`}>
            <header className="od-panel-header">
              <div>
                <div className="od-panel-kind">Table</div>
                <h3>{entity.label}</h3>
              </div>
              <button type="button" className="od-icon-btn" onClick={() => select(null)} aria-label="Close details">
                ×
              </button>
            </header>
            <div className="od-panel-section">
              <div className="od-menu-label">Columns</div>
              {entity.attributes.map((a) => (
                <div className="od-panel-row" key={a.name}>
                  <span>
                    {a.name}
                    {a.meta.length > 0 && <span className="od-panel-muted"> {a.meta.join(' ')}</span>}
                  </span>
                  <span className="od-panel-mono">{a.type ?? ''}</span>
                </div>
              ))}
            </div>
            {related.length > 0 && (
              <div className="od-panel-section">
                <div className="od-menu-label">Relationships</div>
                {related.map((r) => {
                  const outgoing = r.from.entity === entity.name;
                  const other = outgoing ? r.to : r.from;
                  const mine = outgoing ? r.from : r.to;
                  const card = `${many(r, outgoing ? 'from' : 'to') ? 'many' : 'one'} to ${many(r, outgoing ? 'to' : 'from') ? 'many' : 'one'}`;
                  return (
                    <button key={r.id} type="button" className="od-panel-link" onClick={() => select(other.entity)}>
                      <span>
                        {mine.attribute ? `${mine.attribute} → ` : '→ '}
                        {erd.entities.get(other.entity)?.label ?? other.entity}
                        {other.attribute ? `.${other.attribute}` : ''}
                      </span>
                      <span className="od-panel-muted">{r.label ?? card}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        );
      })()}

      {detailsPanel && sequence && selected && sequence.participants.get(selected) && (() => {
        const participant = sequence.participants.get(selected)!;
        const messages = sequence.events.flatMap((e) => (e.type === 'message' && (e.from === participant.name || e.to === participant.name) ? [e] : []));
        const label = (name: string) => sequence.participants.get(name)?.label ?? name;
        return (
          <aside className="od-panel" aria-label={`Details for ${participant.label}`}>
            <header className="od-panel-header">
              <div>
                <div className="od-panel-kind">Participant</div>
                <h3>{participant.label}</h3>
              </div>
              <button type="button" className="od-icon-btn" onClick={() => select(null)} aria-label="Close details">
                ×
              </button>
            </header>
            <div className="od-panel-section">
              <div className="od-menu-label">Messages ({messages.length})</div>
              {messages.map((m, i) => {
                const sent = m.from === participant.name;
                const other = sent ? m.to : m.from;
                return (
                  <button key={i} type="button" className="od-panel-link" onClick={() => other !== participant.name && select(other)}>
                    <span>
                      {other === participant.name ? '↻ itself' : `${sent ? '→' : '←'} ${label(other)}`}
                    </span>
                    {m.label && <span className="od-panel-muted">{m.label}</span>}
                  </button>
                );
              })}
            </div>
          </aside>
        );
      })()}

      {toast && (
        <div className="od-toast" role="status">
          {toast}
        </div>
      )}

      {layoutError && <div className="od-error">Layout failed: {layoutError}</div>}
    </div>
  );
}

export function useResolvedScheme(preference: ColorScheme | 'system'): ColorScheme {
  const query = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null), []);
  const [system, setSystem] = useState<ColorScheme>(query?.matches ? 'dark' : 'light');
  useEffect(() => {
    if (!query) return;
    const update = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [query]);
  return preference === 'system' ? system : preference;
}

function useFontEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    let alive = true;
    const bump = () => alive && setEpoch((e) => e + 1);
    document.fonts.ready.then(bump);
    document.fonts.addEventListener('loadingdone', bump);
    return () => {
      alive = false;
      document.fonts.removeEventListener('loadingdone', bump);
    };
  }, []);
  return epoch;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Measures text with a canvas so node sizes match what the SVG renders. */
function canvasMeasurer(fontFamily: string): TextMeasurer | undefined {
  if (measureContext === undefined) measureContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const ctx = measureContext;
  if (!ctx) return undefined;
  return (text, font) => {
    ctx.font = `${font.weight} ${font.size}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Overlay chrome, styled from the theme's CSS variables (see themeCssVariables).
const CSS = `
.od-root:focus-visible { box-shadow: inset 0 0 0 2px var(--od-color-focus-ring); }
.od-root { container: od / inline-size; }
}
.od-drillable { cursor: zoom-in; }
.od-expand { cursor: pointer; }
.od-header { position: absolute; top: var(--od-space-4); left: var(--od-space-5); right: 120px; pointer-events: none; }
.od-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; font: var(--od-text-ui); pointer-events: auto; }
.od-crumb-item { display: contents; }
.od-crumb { font: inherit; color: var(--od-color-text-muted); background: none; border: 0; padding: 2px 4px; margin: 0 -2px; border-radius: var(--od-radius-sm); cursor: pointer; white-space: nowrap; }
.od-crumb:hover { color: var(--od-color-text); background: var(--od-color-hover); }
.od-crumb:focus-visible { outline: 2px solid var(--od-color-focus-ring); }
.od-crumb-current { color: var(--od-color-text); font-weight: 600; cursor: default; font-size: 15px; }
.od-crumb-current:hover { background: none; }
.od-crumb-sep { color: var(--od-color-text-subtle); padding: 0 2px; }
.od-subtitle { margin: 2px 0 0; font: var(--od-text-ui); color: var(--od-color-text-muted); max-width: 640px; }
.od-toolbar { position: absolute; top: var(--od-space-4); right: var(--od-space-4); display: flex; align-items: center; gap: var(--od-space-2); }
.od-menu-anchor { position: relative; }
.od-tool { display: flex; align-items: center; gap: 6px; font: var(--od-text-ui); font-size: 12px; font-weight: 600; color: var(--od-color-text); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-md); padding: 4px 9px; cursor: pointer; box-shadow: var(--od-shadow-chrome); }
.od-tool:hover, .od-tool[aria-expanded="true"] { background: var(--od-color-hover); }
.od-menu-label { padding: 6px 8px 2px; font: var(--od-text-ui); font-size: 11px; font-weight: 600; color: var(--od-color-text-subtle); text-transform: uppercase; letter-spacing: 0.04em; }
.od-export-menu { min-width: 200px; }
.od-count { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--od-color-accent); color: var(--od-color-on-accent); font-size: 10px; line-height: 16px; text-align: center; }
.od-filter-menu { min-width: 240px; max-width: 320px; padding: 6px; }
.od-chip-row { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px 6px; }
.od-chip { font: var(--od-text-ui); font-size: 12px; color: var(--od-color-text); background: var(--od-color-hover); border: 1px solid transparent; border-radius: 999px; padding: 2px 9px; cursor: pointer; }
.od-chip[aria-pressed="true"] { background: var(--od-color-accent-soft); border-color: var(--od-color-accent); color: var(--od-color-accent); }
.od-chips { position: absolute; top: 72px; left: var(--od-space-5); display: flex; gap: 6px; }
.od-chips .od-chip { background: var(--od-color-accent-soft); color: var(--od-color-accent); border-color: var(--od-color-accent); }
.od-menu-clear { margin-top: 4px; color: var(--od-color-accent) !important; }
.od-dim { opacity: 0.16; transition: opacity 260ms ease; }
.od-march { animation: od-march 0.9s linear infinite; }
.od-pulse { animation: od-pulse 1.4s ease-in-out infinite; }
@keyframes od-march { to { stroke-dashoffset: -30; } }
@keyframes od-pulse { 50% { stroke-opacity: 0.35; } }
.od-player { position: absolute; left: 50%; bottom: var(--od-space-5); transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 4px; max-width: calc(100% - 32px); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: 12px; box-shadow: var(--od-shadow-chrome); font: var(--od-text-ui); }
.od-player-start { display: flex; align-items: center; gap: 8px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--od-color-text); background: none; border: 0; padding: 4px 10px; border-radius: 8px; cursor: pointer; }
.od-player-start:hover { background: var(--od-color-hover); }
.od-player-hint { font-weight: 400; color: var(--od-color-text-muted); }
.od-player-select { font: inherit; font-size: 12.5px; font-weight: 600; color: var(--od-color-text); background: var(--od-color-hover); border: 0; border-radius: 8px; padding: 4px 6px; max-width: 180px; }
.od-player-btn { font: inherit; font-size: 14px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--od-color-text); cursor: pointer; }
.od-player-btn:hover:not(:disabled) { background: var(--od-color-hover); }
.od-player-btn:disabled { color: var(--od-color-text-subtle); cursor: default; }
.od-player-count { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--od-color-text-muted); padding: 0 4px; }
.od-player-caption { font-size: 12.5px; color: var(--od-color-text); padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px; }
.od-panel { position: absolute; top: 64px; right: var(--od-space-4); bottom: var(--od-space-4); width: 300px; overflow: auto; padding: var(--od-space-4); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); font: var(--od-text-ui); color: var(--od-color-text); }
.od-panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.od-panel-header h3 { margin: 2px 0 0; font-size: 16px; font-weight: 600; }
.od-panel-kind { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--od-color-text-subtle); }
.od-panel-desc { margin: 8px 0 4px; color: var(--od-color-text-muted); }
.od-panel-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--od-color-border); font-size: 12.5px; }
.od-panel-row > span:first-child { color: var(--od-color-text-muted); }
.od-panel-row a { color: var(--od-color-accent); word-break: break-all; }
.od-panel-section { margin-top: var(--od-space-3); }
.od-panel-link { display: flex; justify-content: space-between; gap: 8px; width: 100%; font: inherit; font-size: 12.5px; color: var(--od-color-text); background: none; border: 0; padding: 5px 8px; border-radius: var(--od-radius-sm); cursor: pointer; text-align: left; }
.od-panel-link:hover { background: var(--od-color-hover); }
.od-panel-muted { color: var(--od-color-text-muted); }
.od-icon-btn { font: inherit; font-size: 16px; width: 26px; height: 26px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text-muted); cursor: pointer; }
.od-icon-btn:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.od-toast { position: absolute; left: 50%; bottom: var(--od-space-5); transform: translateX(-50%); font: var(--od-text-ui); font-size: 12.5px; color: var(--od-color-on-accent); background: var(--od-color-text); padding: 7px 12px; border-radius: var(--od-radius-md); box-shadow: var(--od-shadow-chrome); }
.od-zoom-trigger { display: flex; align-items: center; gap: 4px; font: var(--od-text-ui); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--od-color-text); background: none; border: 0; padding: 4px 6px; border-radius: var(--od-radius-md); cursor: pointer; }
.od-zoom-trigger:hover, .od-zoom-trigger[aria-expanded="true"] { background: var(--od-color-hover); }
.od-menu { position: absolute; right: 0; top: calc(100% + 4px); min-width: 180px; padding: 4px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); z-index: 1; }
.od-menu button { display: flex; width: 100%; justify-content: space-between; align-items: center; font: var(--od-text-ui); color: var(--od-color-text); background: none; border: 0; padding: 6px 8px; border-radius: var(--od-radius-sm); cursor: pointer; text-align: left; }
.od-menu button:hover { background: var(--od-color-hover); }
.od-menu kbd { font: inherit; font-size: 11px; color: var(--od-color-text-subtle); }
.od-item { transition: transform 600ms var(--od-ease); }
.od-enter { animation: od-enter 560ms var(--od-ease) both; transform-box: fill-box; transform-origin: center; }
.od-draw { stroke-dasharray: 1; animation: od-draw 700ms ease-out both; }
.od-fade { animation: od-fade 360ms ease both; }
.od-action { cursor: pointer; }
.od-resize { cursor: nwse-resize; }
.od-link { cursor: pointer; }
.od-action:hover > rect { fill: rgba(255, 255, 255, 0.14); }

@keyframes od-enter { from { opacity: 0; transform: scale(0.9); } }
@keyframes od-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes od-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .od-item { transition: none; }
  .od-enter, .od-draw, .od-fade { animation: none; }
}
.od-error { position: absolute; left: var(--od-space-3); bottom: var(--od-space-3); color: var(--od-color-danger); font: var(--od-text-ui); font-size: 12px; background: var(--od-color-danger-soft); border-radius: var(--od-radius-md); padding: 6px 8px; }
/* Narrow diagrams (phones, small panes): icon-only tools, title below them. */
@container od (max-width: 560px) {
  .od-toolbar { top: var(--od-space-2); right: var(--od-space-2); gap: 4px; }
  .od-tool { font-size: 0; gap: 0; padding: 6px 7px; }
  .od-tool svg { width: 15px; height: 15px; }
  .od-tool .od-count { font-size: 10px; margin-left: 3px; }
  /* The title stays on the toolbar's row (clipped), so it never overlaps the diagram's top padding. */
  .od-header { left: var(--od-space-3); right: 236px; }
  .od-root:not(:has(.od-toolbar)) .od-header { right: var(--od-space-3); }
  .od-crumbs { flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
  .od-chips { top: 52px; left: var(--od-space-3); flex-wrap: wrap; }
  .od-menu { max-width: calc(100cqw - 16px); }
  .od-player { bottom: var(--od-space-3); }
.od-panel-mono { font-family: var(--od-font-mono, ui-monospace, monospace); font-size: 11.5px; color: var(--od-color-text-muted); }
`;
