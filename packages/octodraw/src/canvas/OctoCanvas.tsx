import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { detectDiagramType } from '../dsl/detect';
import type { IconSet } from '../icons/resolve';
import { loadEraserIcons, loadFullIconCatalog, loadVendorIcons, onIconCatalogChange } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import type { ViewPlacements } from '../layout/arrange';
import { collectFontCss, copyBlob, copyText, downloadBlob, svgToPdf, svgToPng } from '../export/browser';
import { OctoDiagram, useResolvedScheme, type CopyFormat, type ExportFormat, type OctoDiagramHandle, type OctoDiagramProps } from '../react/OctoDiagram';
import { swatchFor } from '../react/theme';
import { themeCssVariables, themes as builtInThemes, type ColorScheme, type Theme } from '../theme/tokens';
import { CommentLayer, type DraftThread } from './Comments';
import { renderCanvasSvg } from './export';
import { InsertPalette, type InsertChoice } from './InsertPalette';
import { moveSlide, presentationSlides, setSlideHidden, setSlideNotes } from './present';
import { CODE_FONT_SIZE, CodeView, FrameView, IconView, ImageView, linePath, LineView, PenView, shapeColors, shapeTextPadding, ShapeView, STICKY_FONT_SIZE, StickyView, TEXT_LINE_HEIGHT, textFont, TextView, type ItemContext } from './items';
import {
  addComment,
  addItems,
  removeComment,
  replyToComment,
  resizeItems,
  canRotate,
  centerOf,
  normalizeAngle,
  offsetInItem,
  resizeRotatedBox,
  rotateItems,
  rotatedBounds,
  selectionToSource,
  snapBox,
  updateComment,
  type CodeItem,
  type CanvasPeer,
  type CommentAuthor,
  type CommentMessage,
  type CommentThread,
  type DeviceKind,
  type FrameItem,
  type ImageItem,
  type SnapResult,
  type StickyItem,
  boundsOf,
  boxesIntersect,
  boxContains,
  boxFromPoints,
  cloneItems,
  cloneWithComments,
  duplicateItems,
  getItem,
  isCanvasDocument,
  itemAt,
  itemsInBox,
  lineBetween,
  bendThrough,
  lineEnds,
  lineGeometry,
  withLineBox,
  moveItems,
  newItemId,
  penFromPoints,
  removeItems,
  reorderItems,
  resizeBox,
  resizeItem,
  resolveLines,
  updateItem,
  type Box,
  type CanvasDocument,
  type CanvasItem,
  type Endpoint,
  type FigureItem,
  type Handle,
  type LayerMove,
  type LineItem,
  type Point,
  type ShapeItem,
  type ShapeKind,
  type TextItem,
  safeLink,
} from './model';
import { renderSourceSvg } from '../export/source';
import { CANVAS_TEMPLATES, FIGURE_TEMPLATES, figureTitle, type CanvasTemplate } from './templates';
import type { CanvasChangeMeta } from './useCanvasHistory';

export type CanvasTool = 'select' | 'hand' | ShapeKind | 'sticky' | 'arrow' | 'line' | 'pen' | 'text' | 'comment';

export interface OctoCanvasHandle {
  zoomToFit(): void;
  /** Zooms in or out by one step about the centre of the view. */
  zoomIn(): void;
  zoomOut(): void;
  /** Pans and zooms to show an item. */
  focusItem(id: string): void;
  /** The canvas point at the centre of the view. */
  viewportCenter(): Point;
  /** Adds a figure at the centre of the view, selects it and returns its id. */
  insertFigure(source: string): string;
  /** The canvas (or the given items) as a standalone SVG, figures included. */
  exportSvg(options?: { ids?: string[]; embedFonts?: boolean }): Promise<string>;
  exportPng(options?: { ids?: string[]; scale?: number }): Promise<Blob>;
  /** Starts presenting (full screen, one slide at a time), optionally at a slide index. */
  present(start?: number): void;
  stopPresenting(): void;
}

export interface OctoCanvasProps {
  ref?: Ref<OctoCanvasHandle>;
  doc: CanvasDocument;
  /** Every finished edit (drags commit on release). `silent` changes shouldn't be undo steps. */
  onChange: (doc: CanvasDocument, meta?: CanvasChangeMeta) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Selected item ids (controlled). Omit to let the canvas manage selection. */
  selection?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** "Edit code" on a selected figure; the host opens its code editor. */
  onOpenFigure?: (id: string) => void;
  /** "Ask AI" on a figure (id) or from the insert palette (null, with the typed prompt). */
  onAskAi?: (figureId: string | null, prompt?: string) => void;
  /** Replays the draw-in animation of a figure whenever `nonce` changes. */
  drawIn?: { id: string; nonce: number };
  /** Extra props for every figure's OctoDiagram (e.g. onLinkClick). */
  figureProps?: Partial<OctoDiagramProps>;
  colorScheme?: ColorScheme | 'system';
  themes?: Partial<Record<ColorScheme, Theme>>;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Dot grid. Defaults to true. */
  grid?: boolean;
  /** Who writes new comments. Defaults to "You". */
  user?: CommentAuthor;
  /** People who can be @mentioned in comments (the host's team or document members). */
  people?: CommentAuthor[];
  /** Someone was @mentioned in a comment: the host notifies them (email, inbox, …). */
  onMention?: (event: { thread: CommentThread; message: CommentMessage; mentioned: CommentAuthor[] }) => void;
  /** Stores a pasted or dropped image and returns its URL; without it images are kept as data URLs. */
  onUploadImage?: (file: File) => Promise<string>;
  /** Called when presentation mode starts (with the slide index), changes slide, or ends (null). */
  onPresentChange?: (slide: number | null) => void;
  /** Starter boards for the empty-canvas gallery and the insert palette (default: the built-in ones; spread CANVAS_TEMPLATES to add to them). */
  templates?: CanvasTemplate[];
  /** Outlines items in a colour (item id → CSS colour), e.g. what a version added or changed. */
  highlights?: Record<string, string>;
  /** Items drawn faded, e.g. ones a version removed (shown so the change is visible). */
  ghosts?: string[];
  /** View only (e.g. previewing an old version): pan, zoom and open figures, no edits. */
  readOnly?: boolean;
  /** Other people here: their cursors and selections are drawn in their colour. */
  peers?: CanvasPeer[];
  /** This user's pointer (canvas units, null when it leaves) and selection, for the host to broadcast. */
  onPresenceChange?: (presence: { cursor: Point | null; selection: string[]; view: Box; laser?: boolean }) => void;
  /** Keep the camera on this peer's view (their `view`) until the user moves it. */
  following?: CanvasPeer['clientId'] | null;
  /** The user panned or zoomed while following someone. */
  onStopFollowing?: () => void;
  className?: string;
  style?: CSSProperties;
}

interface Camera {
  x: number;
  y: number;
  k: number;
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'move'; start: Point; ids: string[]; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: Point; box: Box }
  | { kind: 'resize-group'; ids: string[]; handle: Handle; start: Point; box: Box }
  | { kind: 'rotate'; ids: string[]; pivot: Point; from: number; base: number }
  | { kind: 'marquee'; start: Point; base: string[] }
  | { kind: 'create'; start: Point; shape: ShapeKind; id: string }
  | { kind: 'pen'; points: Point[] }
  | { kind: 'line'; start: Endpoint; arrow: boolean }
  | { kind: 'endpoint'; id: string; which: 'start' | 'end' }
  | { kind: 'bend'; id: string };

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const COLORS = [undefined, 'blue', 'green', 'red', 'orange', 'purple', 'yellow', 'gray'] as const;
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_ANGLE: Record<Handle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
/** The resize cursor for a handle on an item turned by `rotation` degrees. */
const resizeCursor = (handle: Handle, rotation: number) => CURSORS[Math.round((((HANDLE_ANGLE[handle] + rotation) % 180) + 180) % 180 / 45) % 4]!;
const TOOL_KEYS: Record<string, CanvasTool> = { v: 'select', h: 'hand', r: 'rectangle', o: 'ellipse', d: 'diamond', s: 'sticky', a: 'arrow', l: 'line', p: 'pen', t: 'text', c: 'comment' };
const FONT_SIZES = [
  ['S', 14],
  ['M', 20],
  ['L', 32],
  ['XL', 48],
] as const;
const DEVICE_SIZES: Record<DeviceKind, [number, number]> = { phone: [300, 620], tablet: [620, 820], browser: [960, 620], desktop: [960, 640] };
const DEFAULT_USER: CommentAuthor = { id: 'me', name: 'You' };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

let measureContext: CanvasRenderingContext2D | null | undefined;
function measureTextBox(text: string, fontSize: number, font: string, weight: number): { w: number; h: number } {
  if (measureContext === undefined) measureContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const lines = (text || ' ').split('\n');
  let width = lines.reduce((max, l) => Math.max(max, l.length * fontSize * 0.55), 0);
  if (measureContext) {
    measureContext.font = `${weight} ${fontSize}px ${font}`;
    width = lines.reduce((max, l) => Math.max(max, measureContext!.measureText(l).width), 0);
  }
  return { w: Math.ceil(width) + 6, h: Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT) + 2 };
}

/** An infinite canvas of shapes, text, pen strokes, arrows, icons and diagram figures. */
export function OctoCanvas(props: OctoCanvasProps) {
  const { doc, onChange, onUndo, onRedo, onOpenFigure, onAskAi, drawIn, figureProps, colorScheme = 'system', icons, iconSet = 'eraser', grid = true, user = DEFAULT_USER, onUploadImage, className, style } = props;
  const scheme = useResolvedScheme(colorScheme);
  const theme = props.themes?.[scheme] ?? builtInThemes[scheme];
  const cssVars = useMemo(() => themeCssVariables(theme) as CSSProperties, [theme]);
  const ctx = useMemo<ItemContext>(() => ({ theme, icons, iconSet }), [theme, icons, iconSet]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const [tool, setTool] = useState<CanvasTool>('select');
  // The document while a drag is in progress; committed on release.
  const [preview, setPreviewState] = useState<CanvasDocument | null>(null);
  const previewRef = useRef<CanvasDocument | null>(null);
  const setPreview = (next: CanvasDocument | null) => {
    previewRef.current = next;
    setPreviewState(next);
  };
  const shown = preview ?? doc;
  const docRef = useRef(doc);
  docRef.current = doc;
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<SnapResult['guides'] | null>(null);
  /** Angle shown while a rotate handle is dragged. */
  const [rotating, setRotating] = useState<number | null>(null);
  const [openComment, setOpenComment] = useState<string | null>(null);
  const [draftComment, setDraftComment] = useState<DraftThread | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [figureExportOpen, setFigureExportOpen] = useState(false);
  /** A small container (phone, narrow host pane): opened figures go full screen. */
  const [compact, setCompact] = useState(false);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setCompact(el.clientWidth < 640);
      setRootSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  /** Handles are bigger for fingers than for a mouse. */
  const [handle, setHandle] = useState(9);
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)');
    if (!query) return;
    const update = () => setHandle(query.matches ? 16 : 9);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const figureRefs = useRef(new Map<string, OctoDiagramHandle>());
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ d: number; mid: Point; cam: Camera } | null>(null);
  const [entered, setEntered] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [panning, setPanning] = useState(false);
  const spaceHeld = useRef(false);
  // Until the user moves the camera, keep everything in view as figures size themselves.
  const cameraTouched = useRef(false);
  // A just-inserted figure the camera should follow once it knows its size.
  const followFigure = useRef<string | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selection = props.selection ?? ownSelection;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const setSelection = useCallback(
    (ids: string[]) => {
      if (!props.selection) setOwnSelection(ids);
      props.onSelectionChange?.(ids);
    },
    [props.selection, props.onSelectionChange],
  );
  // ---- presentation mode ----
  const [presenting, setPresenting] = useState<number | null>(null);
  const allSlides = useMemo(() => presentationSlides(doc), [doc]);
  const slides = useMemo(() => allSlides.filter((s) => !s.hidden), [allSlides]);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [laser, setLaser] = useState(false);
  /** The presenter's own window (notes, next slide, timer), rendered through a portal. */
  const [presenterWin, setPresenterWin] = useState<Window | null>(null);
  const presenterWinRef = useRef<Window | null>(null);
  presenterWinRef.current = presenterWin;
  const [presentStartedAt, setPresentStartedAt] = useState(0);
  const laserRef = useRef(false);
  laserRef.current = laser;
  /** Recent laser positions (screen coordinates) for the fading trail. */
  const [laserTrail, setLaserTrail] = useState<{ x: number; y: number; t: number }[]>([]);
  const readOnly = !!props.readOnly || presenting !== null;
  const templates = props.templates ?? CANVAS_TEMPLATES;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  // Leaving edit mode clears what was being edited.
  useEffect(() => {
    if (readOnly) setOwnSelection([]);
  }, [readOnly]);
  // Presence: report the pointer (at most once a frame) and the selection.
  const presenceRef = useRef(props.onPresenceChange);
  presenceRef.current = props.onPresenceChange;
  const pointerFrame = useRef(0);
  const lastCursor = useRef<Point | null>(null);
  useEffect(() => presenceRef.current?.({ cursor: lastCursor.current, selection, view: visibleBox() }), [selection]);
  /** The part of the canvas this user can see, in canvas units. */
  const visibleBox = (): Box => {
    const { width, height } = viewport();
    const c = camRef.current;
    return { x: -c.x / c.k, y: -c.y / c.k, w: width / c.k, h: height / c.k };
  };
  const report = () => {
    if (!presenceRef.current || pointerFrame.current) return;
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = 0;
      presenceRef.current?.({ cursor: lastCursor.current, selection: selectionRef.current, view: visibleBox(), laser: laserRef.current && presentingRef.current !== null });
    });
  };
  const reportCursor = (cursor: Point | null) => {
    lastCursor.current = cursor;
    report();
  };
  const stopFollowingRef = useRef(props.onStopFollowing);
  stopFollowingRef.current = props.onStopFollowing;
  const followingRef = useRef(props.following);
  followingRef.current = props.following;
  const stopFollowing = () => {
    if (followingRef.current != null) stopFollowingRef.current?.();
  };
  // Drop selected ids that no longer exist (undo, remote edits).
  useEffect(() => {
    const alive = selection.filter((id) => getItem(doc, id));
    if (alive.length !== selection.length) setSelection(alive);
    if (entered && !getItem(doc, entered)) setEntered(null);
  }, [doc, selection, entered, setSelection]);

  // Icons used by items load in the background; re-render when they land.
  const [, setIconEpoch] = useState(0);
  useEffect(() => {
    const unsubscribe = onIconCatalogChange(() => setIconEpoch((e) => e + 1));
    loadFullIconCatalog().catch(() => {});
    loadVendorIcons().catch(() => {});
    if (iconSet === 'eraser') loadEraserIcons().catch(() => {});
    return unsubscribe;
  }, [iconSet]);

  const commit = useCallback((next: CanvasDocument, meta?: CanvasChangeMeta) => onChange(next, meta), [onChange]);

  // ---- camera ----
  const viewport = () => {
    const el = rootRef.current;
    return { width: el?.clientWidth || 800, height: el?.clientHeight || 600 };
  };
  const toWorld = (clientX: number, clientY: number): Point => {
    const rect = rootRef.current!.getBoundingClientRect();
    const c = camRef.current;
    return { x: (clientX - rect.left - c.x) / c.k, y: (clientY - rect.top - c.y) / c.k };
  };
  const fitBox = useCallback((box: Box, maxScale = 1) => {
    const { width, height } = viewport();
    const pad = 64;
    const k = clamp(Math.min((width - pad * 2) / Math.max(box.w, 1), (height - pad * 2) / Math.max(box.h, 1), maxScale), ZOOM_MIN, ZOOM_MAX);
    setCam({ k, x: width / 2 - (box.x + box.w / 2) * k, y: height / 2 - (box.y + box.h / 2) * k });
  }, []);
  // Report this user's view as the camera moves, and follow someone else's.
  useEffect(() => report(), [cam]); // eslint-disable-line react-hooks/exhaustive-deps
  const followedView = props.following != null ? props.peers?.find((p) => p.clientId === props.following)?.view : undefined;
  const followedKey = followedView ? `${followedView.x},${followedView.y},${followedView.w},${followedView.h}` : '';
  useEffect(() => {
    if (!followedView) return;
    const { width, height } = viewport();
    const k = clamp(Math.min(width / Math.max(followedView.w, 1), height / Math.max(followedView.h, 1)), ZOOM_MIN, ZOOM_MAX);
    cameraTouched.current = true;
    setCam({ k, x: width / 2 - (followedView.x + followedView.w / 2) * k, y: height / 2 - (followedView.y + followedView.h / 2) * k });
  }, [followedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomToFit = useCallback(() => {
    const box = boundsOf(docRef.current.items);
    if (box) fitBox(box);
    else {
      const { width, height } = viewport();
      setCam({ k: 1, x: width / 2, y: height / 2 });
    }
  }, [fitBox]);
  useLayoutEffect(() => zoomToFit(), [zoomToFit]);
  const zoomAt = (k: number, sx?: number, sy?: number) => {
    cameraTouched.current = true;
    stopFollowing();
    const { width, height } = viewport();
    const px = sx ?? width / 2;
    const py = sy ?? height / 2;
    setCam((c) => {
      const next = clamp(k, ZOOM_MIN, ZOOM_MAX);
      return { k: next, x: px - ((px - c.x) / c.k) * next, y: py - ((py - c.y) / c.k) * next };
    });
  };
  const viewportCenter = (): Point => {
    const { width, height } = viewport();
    const c = camRef.current;
    return { x: (width / 2 - c.x) / c.k, y: (height / 2 - c.y) / c.k };
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('.occ-palette-backdrop, .occ-menu')) return;
      event.preventDefault();
      cameraTouched.current = true;
      stopFollowing();
      const rect = el.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const c = camRef.current;
        zoomAt(c.k * Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top);
      } else {
        setCam((c) => ({ ...c, x: c.x - event.deltaX, y: c.y - event.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- inserting ----
  const insert = useCallback(
    (items: CanvasItem[], opts: { edit?: boolean } = {}) => {
      commit(resolveLines(addItems(docRef.current, items)));
      setSelection(items.map((i) => i.id));
      setTool('select');
      if (opts.edit && items[0]) setEditing(items[0].id);
    },
    [commit, setSelection],
  );
  /** A free spot for a new item: the centre of the view, or right of everything when that's taken. */
  const freeSpot = (w: number, h: number): Box => {
    const c = viewportCenter();
    const box = { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h };
    const items = docRef.current.items;
    if (!items.some((i) => boxesIntersect(i, box))) return box;
    const all = boundsOf(items)!;
    return { x: Math.round(all.x + all.w + 80), y: Math.round(all.y), w, h };
  };
  const newFigure = (source: string): FigureItem => ({ id: newItemId(), type: 'figure', ...freeSpot(480, 320), source, autoSize: true });
  /** Shows a newly placed figure now and fits it once it has sized itself. */
  const follow = (figure: Box & { id: string }) => {
    followFigure.current = figure.id;
    const { width, height } = viewport();
    const k = camRef.current.k;
    const c = { x: figure.x + figure.w / 2, y: figure.y + figure.h / 2 };
    setCam({ k, x: width / 2 - c.x * k, y: height / 2 - c.y * k });
  };
  const newShape = (shape: ShapeKind, box: Box): ShapeItem => ({ id: newItemId(), type: 'shape', shape, ...box });
  const newText = (at: Point): TextItem => ({ id: newItemId(), type: 'text', x: at.x, y: at.y - 13, w: 24, h: 26, text: '', fontSize: 20 });
  const newSticky = (at: Point, color?: string): StickyItem => ({ id: newItemId(), type: 'sticky', x: Math.round(at.x - 100), y: Math.round(at.y - 100), w: 200, h: 200, text: '', color });
  const newCode = (): CodeItem => ({ id: newItemId(), type: 'code', ...freeSpot(420, 180), text: '// code\n', language: 'typescript' });
  const newFrame = (device: DeviceKind): FrameItem => {
    const [w, h] = DEVICE_SIZES[device];
    return { id: newItemId(), type: 'frame', device, ...freeSpot(w, h), title: device === 'browser' ? 'example.com' : undefined };
  };

  /** Adds an image (uploaded through the host when it can) at a point, scaled to at most 480px. */
  const insertImage = useCallback(
    async (file: File, at?: Point) => {
      const src = onUploadImage
        ? await onUploadImage(file)
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
      const size = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 240 });
        img.onerror = () => resolve({ w: 320, h: 240 });
        img.src = src;
      });
      const scale = Math.min(1, 480 / Math.max(size.w, size.h));
      const w = Math.round(size.w * scale);
      const h = Math.round(size.h * scale);
      const box = at ? { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h } : freeSpot(w, h);
      const image: ImageItem = { id: newItemId(), type: 'image', src, alt: file.name, ...box };
      insert([image]);
    },
    // freeSpot reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUploadImage, insert],
  );
  const filePicker = useRef<HTMLInputElement>(null);

  /** The canvas as SVG; figures export themselves through their OctoDiagram handles. */
  const exportSvg = useCallback(
    async ({ ids, embedFonts = true }: { ids?: string[]; embedFonts?: boolean } = {}) => {
      const current = docRef.current;
      const wanted = ids ? new Set(ids) : undefined;
      const figureSvgs = new Map<string, string>();
      for (const item of current.items) {
        if (item.type !== 'figure' || (wanted && !wanted.has(item.id))) continue;
        // Off-screen figures aren't mounted; render those straight from their code.
        const svg = (await figureRefs.current.get(item.id)?.exportSvg({ embedFonts: false, title: true })) ?? (await renderSourceSvg(item.source, { theme, icons, iconSet, placements: item.placements, title: true })).svg;
        if (svg) figureSvgs.set(item.id, svg);
      }
      const fontCss = embedFonts ? await collectFontCss([theme.font.sans, theme.font.mono]).catch(() => '') : undefined;
      return renderCanvasSvg(current, { theme, icons, iconSet, figureSvgs, fontCss, ids });
    },
    [theme, icons, iconSet],
  );

  /** Adds a whole-canvas template at a free spot and shows it. */
  const insertTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const items = template.build();
    const box = boundsOf(items)!;
    const spot = freeSpot(box.w, box.h);
    const placed = cloneItems(items, spot.x - box.x, spot.y - box.y);
    insert(placed);
    cameraTouched.current = true;
    fitBox(spot);
  };

  const choose = (choice: InsertChoice) => {
    setPaletteOpen(false);
    rootRef.current?.focus({ preventScroll: true });
    const c = viewportCenter();
    if (choice.kind === 'template') {
      const figure = newFigure(FIGURE_TEMPLATES.find((t) => t.id === choice.id)!.source);
      insert([figure]);
      follow(figure);
    }
    else if (choice.kind === 'board') insertTemplate(choice.id);
    else if (choice.kind === 'shape') insert([newShape(choice.shape, { x: c.x - 80, y: c.y - 40, w: 160, h: 80 })], { edit: true });
    else if (choice.kind === 'text') insert([newText(c)], { edit: true });
    else if (choice.kind === 'sticky') insert([newSticky(c)], { edit: true });
    else if (choice.kind === 'code') insert([newCode()], { edit: true });
    else if (choice.kind === 'image') filePicker.current?.click();
    else if (choice.kind === 'frame') {
      // Frames sit behind what's drawn in them.
      const frame = newFrame(choice.device);
      commit(reorderItems(addItems(docRef.current, [frame]), [frame.id], 'back'));
      setSelection([frame.id]);
      setTool('select');
      follow(frame);
    }
    else if (choice.kind === 'icon') insert([{ id: newItemId(), type: 'icon', name: choice.name, x: c.x - 24, y: c.y - 24, w: 48, h: 48 }]);
    else onAskAi?.(null, choice.prompt);
  };

  useImperativeHandle(
    props.ref,
    () => ({
      zoomToFit,
      zoomIn: () => zoomAt(camRef.current.k * 1.25),
      zoomOut: () => zoomAt(camRef.current.k / 1.25),
      focusItem: (id: string) => {
        const item = getItem(docRef.current, id);
        cameraTouched.current = true;
        if (item) fitBox(item);
      },
      viewportCenter,
      insertFigure: (source: string) => {
        const figure = newFigure(source);
        insert([figure]);
        follow(figure);
        return figure.id;
      },
      exportSvg: async (options) => (await exportSvg(options)).svg,
      exportPng: async ({ ids, scale = 2 } = {}) => {
        const { svg, width, height } = await exportSvg({ ids });
        return svgToPng(svg, width, height, scale);
      },
      present: (start?: number) => presentApi.current.start(start),
      stopPresenting: () => presentApi.current.stop(),
    }),
    [zoomToFit, fitBox, insert, exportSvg],
  );

  // ---- pointer gestures ----
  const handleMove = useCallback(
    (event: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      const base = docRef.current;
      if (g.kind === 'pan') {
        setCam({ ...g.cam, x: g.cam.x + event.clientX - g.sx, y: g.cam.y + event.clientY - g.sy });
        return;
      }
      const p = toWorld(event.clientX, event.clientY);
      // Snap to other items' edges and centres (hold Alt to place freely).
      const threshold = 6 / camRef.current.k;
      const snap = (box: Box, exclude: Iterable<string>, axes?: { x?: boolean; y?: boolean }): SnapResult => {
        if (event.altKey) return { dx: 0, dy: 0, guides: {} };
        const skip = new Set(exclude);
        const others = base.items.filter((i) => !skip.has(i.id) && i.type !== 'line' && i.type !== 'pen').map((i) => (i.rotation ? rotatedBounds(i, i.rotation) : i));
        return snapBox(box, others, threshold, axes);
      };
      const showGuides = (r: SnapResult) => setGuides(r.guides.x || r.guides.y ? r.guides : null);
      switch (g.kind) {
        case 'move': {
          let dx = p.x - g.start.x;
          let dy = p.y - g.start.y;
          if (!g.moved && Math.hypot(dx, dy) * camRef.current.k < 3) return;
          g.moved = true;
          const moving = base.items.filter((i) => g.ids.includes(i.id) && i.type !== 'line');
          const box = boundsOf(moving);
          if (box) {
            const r = snap({ ...box, x: box.x + dx, y: box.y + dy }, g.ids);
            dx += r.dx;
            dy += r.dy;
            showGuides(r);
          }
          setPreview(moveItems(base, g.ids, dx, dy));
          break;
        }
        case 'resize': {
          const rotation = getItem(base, g.id)?.rotation;
          if (rotation) {
            // Snapping a turned box to straight edges isn't meaningful; resize in its own frame.
            setPreview(resizeItem(base, g.id, resizeRotatedBox(g.box, rotation, g.handle, p.x - g.start.x, p.y - g.start.y, event.shiftKey)));
            break;
          }
          const box = resizeBox(g.box, g.handle, p.x - g.start.x, p.y - g.start.y, event.shiftKey);
          if (!event.shiftKey) {
            // Snap the edges being dragged.
            const r = snap(box, [g.id], { x: /[ew]/.test(g.handle), y: /[ns]/.test(g.handle) });
            if (g.handle.includes('e')) box.w += r.dx;
            if (g.handle.includes('w')) {
              box.x += r.dx;
              box.w -= r.dx;
            }
            if (g.handle.includes('s')) box.h += r.dy;
            if (g.handle.includes('n')) {
              box.y += r.dy;
              box.h -= r.dy;
            }
            showGuides(r);
          }
          setPreview(resizeItem(base, g.id, box));
          break;
        }
        case 'rotate': {
          const angle = (Math.atan2(p.y - g.pivot.y, p.x - g.pivot.x) * 180) / Math.PI;
          // Snap the resulting angle: to 15° steps with Shift, otherwise to right angles when close.
          let target = normalizeAngle(g.base + angle - g.from);
          const step = event.shiftKey ? 15 : 90;
          const nearest = Math.round(target / step) * step;
          target = event.shiftKey || Math.abs(target - nearest) < 4 ? nearest : Math.round(target);
          setRotating(normalizeAngle(target));
          setPreview(rotateItems(base, g.ids, target - g.base, g.pivot));
          break;
        }
        case 'resize-group':
          setPreview(resizeItems(base, g.ids, g.box, resizeBox(g.box, g.handle, p.x - g.start.x, p.y - g.start.y, event.shiftKey)));
          break;
        case 'marquee': {
          const box = boxFromPoints(g.start, p);
          setMarquee(box);
          const inside = itemsInBox(base, box).map((i) => i.id);
          setSelection([...new Set([...g.base, ...inside])]);
          break;
        }
        case 'create': {
          const r = snap({ x: p.x, y: p.y, w: 0, h: 0 }, []);
          showGuides(r);
          let box = boxFromPoints(g.start, { x: p.x + r.dx, y: p.y + r.dy });
          if (event.shiftKey) {
            const side = Math.max(box.w, box.h);
            box = boxFromPoints(g.start, { x: g.start.x + Math.sign(p.x - g.start.x || 1) * side, y: g.start.y + Math.sign(p.y - g.start.y || 1) * side });
          }
          setPreview(addItems(base, [newShape(g.shape, box)].map((s) => ({ ...s, id: g.id }))));
          break;
        }
        case 'pen':
          g.points.push(p);
          setPreview(addItems(base, [{ ...penFromPoints(g.points), id: 'occ-pen-draft' }]));
          break;
        case 'line': {
          const target = itemAt(base, p, 0);
          const end: Endpoint = target && target.type !== 'line' && target.id !== g.start.item ? { ...p, item: target.id } : p;
          setPreview(resolveLines(addItems(base, [{ ...lineBetween(g.start, end, { endArrow: g.arrow }), id: 'occ-line-draft' }])));
          break;
        }
        case 'endpoint': {
          const line = getItem(base, g.id) as LineItem | undefined;
          if (!line) return;
          const target = itemAt(base, p, 0);
          const end: Endpoint = target && target.type !== 'line' ? { ...p, item: target.id } : p;
          // A new attachment aims at the item's centre (any old anchor is dropped with the old end).
          setPreview(resolveLines(updateItem(base, g.id, withLineBox({ ...line, [g.which]: end }))));
          break;
        }
        case 'bend': {
          const line = getItem(base, g.id) as LineItem | undefined;
          if (!line || line.locked) return;
          const bend = bendThrough(base, line, p, 4 / camRef.current.k);
          setPreview(resolveLines(updateItem(base, g.id, withLineBox({ ...line, bend }, lineEnds(base, { ...line, bend })))));
          break;
        }
      }
    },
    // toWorld and newShape read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSelection],
  );

  const handleUp = useCallback(
    (event: PointerEvent) => {
      const g = gesture.current;
      gesture.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setPanning(false);
      setMarquee(null);
      setGuides(null);
      setRotating(null);
      if (!g) return;
      // Presenting on a touch screen: a sideways swipe changes slide.
      if (g.kind === 'pan' && presentingRef.current !== null && event.pointerType === 'touch') {
        const dx = event.clientX - g.sx;
        const dy = event.clientY - g.sy;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) presentApi.current.goTo(presentingRef.current + (dx < 0 ? 1 : -1));
        else presentApi.current.show(presentingRef.current, true);
        return;
      }
      const base = docRef.current;
      const current = previewRef.current;
      setPreview(null);
      if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'resize-group' || g.kind === 'rotate' || g.kind === 'endpoint' || g.kind === 'bend') {
        if (current && current !== base) commit(current);
      } else if (g.kind === 'create') {
        const drawn = current ? (getItem(current, g.id) as ShapeItem | undefined) : undefined;
        const small = !drawn || drawn.w < 8 || drawn.h < 8;
        insert([small ? newShape(g.shape, { x: g.start.x - 80, y: g.start.y - 40, w: 160, h: 80 }) : drawn!].map((shape) => ({ ...shape, id: g.id })));
      } else if (g.kind === 'pen') {
        if (g.points.length > 1) insert([penFromPoints(g.points)]);
      } else if (g.kind === 'line') {
        const p = toWorld(event.clientX, event.clientY);
        const draft = current ? (getItem(current, 'occ-line-draft') as LineItem | undefined) : undefined;
        if (draft && Math.hypot(p.x - g.start.x, p.y - g.start.y) * camRef.current.k > 6) insert([{ ...draft, id: newItemId() }]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleMove, commit, insert],
  );

  const begin = (g: Gesture) => {
    gesture.current = g;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };
  const cancelGesture = () => {
    gesture.current = null;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    setPreview(null);
    setMarquee(null);
    setGuides(null);
    setPanning(false);
  };

  // Touch: two fingers pinch to zoom and pan.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = pinch.current;
      const pts = [...touches.current.values()];
      if (!start || pts.length < 2) return;
      const [a, b] = pts as [Point, Point];
      const rect = rootRef.current!.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const k = clamp(start.cam.k * (Math.hypot(a.x - b.x, a.y - b.y) / start.d), ZOOM_MIN, ZOOM_MAX);
      // Keep the canvas point under the starting midpoint under the fingers.
      const wx = (start.mid.x - start.cam.x) / start.cam.k;
      const wy = (start.mid.y - start.cam.y) / start.cam.k;
      setCam({ k, x: mid.x - wx * k, y: mid.y - wy * k });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.current.delete(event.pointerId);
      if (touches.current.size < 2) pinch.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    const target = event.target as Element;
    if (target.closest('.occ-chrome, .occ-palette-backdrop, .occ-editor, .occ-comments, .occ-focus')) return;
    if (entered && target.closest(`[data-item-id="${entered}"] .occ-figure-body`)) return;
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()] as [Point, Point];
        const rect = rootRef.current!.getBoundingClientRect();
        cancelGesture();
        cameraTouched.current = true;
        stopFollowing();
        pinch.current = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }, cam: camRef.current };
        return;
      }
    }
    if (editing) setEditing(null);
    setArrangeOpen(false);
    setExportOpen(false);
    setFigureExportOpen(false);
    if (openComment) setOpenComment(null);
    if (draftComment) setDraftComment(null);
    rootRef.current?.focus({ preventScroll: true });
    // The laser pointer only points.
    if (presenting !== null && laser && event.pointerType !== 'touch') return;
    if (event.button === 1 || (event.button === 0 && (tool === 'hand' || spaceHeld.current || readOnly))) {
      event.preventDefault();
      setPanning(true);
      cameraTouched.current = true;
      stopFollowing();
      begin({ kind: 'pan', sx: event.clientX, sy: event.clientY, cam: camRef.current });
      return;
    }
    if (event.button !== 0) return;
    const p = toWorld(event.clientX, event.clientY);
    if (entered) setEntered(null);
    // These tools open an editor; keep the browser from moving focus back to the canvas on this click.
    if (tool === 'text' || tool === 'sticky' || tool === 'comment') event.preventDefault();

    switch (tool) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
        begin({ kind: 'create', start: p, shape: tool, id: newItemId() });
        return;
      case 'pen':
        begin({ kind: 'pen', points: [p] });
        return;
      case 'text':
        insert([newText(p)], { edit: true });
        return;
      case 'sticky':
        insert([newSticky(p)], { edit: true });
        return;
      case 'comment': {
        const id = target.closest('[data-item-id]')?.getAttribute('data-item-id');
        const item = id ? getItem(doc, id) : undefined;
        setDraftComment(item ? { item: item.id, ...offsetInItem(item, p) } : { x: p.x, y: p.y });
        setOpenComment(null);
        setTool('select');
        return;
      }
      case 'arrow':
      case 'line': {
        const hit = itemAt(doc, p, 0);
        begin({ kind: 'line', start: hit && hit.type !== 'line' ? { ...p, item: hit.id } : p, arrow: tool === 'arrow' });
        return;
      }
    }

    const handle = target.closest('[data-handle]');
    if (handle) {
      const id = handle.getAttribute('data-for')!;
      const kind = handle.getAttribute('data-handle')!;
      if (kind === 'start' || kind === 'end') begin({ kind: 'endpoint', id, which: kind });
      else if (kind === 'bend') begin({ kind: 'bend', id });
      else if (kind === 'rotate') {
        const items = doc.items.filter((i) => selection.includes(i.id));
        const pivot = centerOf(boundsOf(items)!);
        // A single item reports its own angle; a group turns from 0.
        const base = items.length === 1 ? (items[0]!.rotation ?? 0) : 0;
        begin({ kind: 'rotate', ids: selection, pivot, from: (Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180) / Math.PI, base });
      } else if (id === '__group__') {
        const box = boundsOf(doc.items.filter((i) => selection.includes(i.id)))!;
        begin({ kind: 'resize-group', ids: selection, handle: kind as Handle, start: p, box });
      } else {
        const item = getItem(doc, id)!;
        begin({ kind: 'resize', id, handle: kind as Handle, start: p, box: { x: item.x, y: item.y, w: item.w, h: item.h } });
      }
      return;
    }
    const hitId = target.closest('[data-item-id]')?.getAttribute('data-item-id');
    const hit = hitId ? getItem(doc, hitId) : undefined;
    if (hit) {
      let ids = selection;
      if (event.shiftKey) ids = selection.includes(hit.id) ? selection.filter((id) => id !== hit.id) : [...selection, hit.id];
      else if (!selection.includes(hit.id)) ids = [hit.id];
      setSelection(ids);
      if (!ids.includes(hit.id)) return;
      // Device frames carry what's drawn inside them.
      const carried = doc.items.filter((f): f is FrameItem => f.type === 'frame' && ids.includes(f.id)).flatMap((f) => itemsInBox(doc, f).map((i) => i.id));
      begin({ kind: 'move', start: p, ids: [...new Set([...ids, ...carried])], moved: false });
      return;
    }
    if (event.pointerType === 'touch') {
      // One finger on empty canvas pans.
      setPanning(true);
      cameraTouched.current = true;
      stopFollowing();
      begin({ kind: 'pan', sx: event.clientX, sy: event.clientY, cam: camRef.current });
      return;
    }
    if (!event.shiftKey) setSelection([]);
    begin({ kind: 'marquee', start: p, base: event.shiftKey ? selection : [] });
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as Element;
    if (target.closest('.occ-chrome, .occ-editor') || tool !== 'select') return;
    const id = target.closest('[data-item-id]')?.getAttribute('data-item-id');
    const item = id ? getItem(doc, id) : undefined;
    if (readOnly) {
      if (item?.type === 'figure') enterFigure(item.id);
      else if (item && safeLink(item)) window.open(safeLink(item), '_blank', 'noopener,noreferrer');
      return;
    }
    if (!item) {
      insert([newText(toWorld(event.clientX, event.clientY))], { edit: true });
      return;
    }
    if (item.type === 'figure') enterFigure(item.id);
    else if (item.type === 'shape' || item.type === 'text' || item.type === 'line' || item.type === 'sticky' || item.type === 'code') setEditing(item.id);
  };

  const enterFigure = (id: string) => {
    setSelection([id]);
    setEntered(id);
  };

  // ---- editing commands ----
  const removeSelected = () => {
    if (!selection.length) return;
    commit(removeItems(doc, selection));
    setSelection([]);
  };
  const duplicateSelected = () => {
    if (!selection.length) return;
    const result = duplicateItems(doc, selection);
    commit(result.doc);
    setSelection(result.ids);
  };
  const arrange = (move: LayerMove) => {
    commit(reorderItems(doc, selection, move));
    setArrangeOpen(false);
  };
  const rotateSelected = (degrees: number | 'reset') => {
    setArrangeOpen(false);
    if (degrees !== 'reset') return commit(rotateItems(doc, selection, degrees));
    let next = doc;
    for (const id of selection) if (getItem(next, id)?.rotation) next = updateItem(next, id, { rotation: undefined });
    commit(resolveLines(next));
  };
  const recolor = (color: string | undefined) => {
    let next = doc;
    for (const id of selection) if (getItem(next, id)?.type !== 'figure') next = updateItem(next, id, { color });
    commit(next);
  };
  const formatText = (patch: Partial<Pick<TextItem, 'fontSize' | 'bold' | 'align'>>) => {
    let next = doc;
    for (const id of selection) {
      const item = getItem(next, id);
      if (item?.type !== 'text') continue;
      const merged = { ...item, ...patch };
      next = updateItem(next, id, { ...patch, ...measureTextBox(merged.text, merged.fontSize, theme.font.sans, merged.bold ? 700 : theme.text.node.weight) });
    }
    commit(next);
  };
  /** Replaces hand-drawn boxes and the arrows between them with a diagram figure. */
  const toFigure = () => {
    const source = selectionToSource(doc, selection);
    const convertible = new Set(doc.items.filter((i) => selection.includes(i.id) && (i.type === 'shape' || i.type === 'sticky' || i.type === 'icon' || i.type === 'text')).map((i) => i.id));
    const lines = doc.items.filter((i) => i.type === 'line' && selection.includes(i.id) && i.start.item && i.end.item && convertible.has(i.start.item) && convertible.has(i.end.item)).map((i) => i.id);
    const box = boundsOf(doc.items.filter((i) => convertible.has(i.id)))!;
    const figure: FigureItem = { id: newItemId(), type: 'figure', x: box.x, y: box.y, w: Math.max(240, box.w), h: Math.max(160, box.h), source, autoSize: true };
    commit(addItems(removeItems(doc, [...convertible, ...lines]), [figure]));
    setSelection([figure.id]);
  };
  const commentOn = (item: CanvasItem) => {
    setDraftComment({ item: item.id, x: item.w, y: 0 });
    setOpenComment(null);
  };
  const postComment = (threadId: string | null, text: string, mentioned: CommentAuthor[] = []) => {
    const message: CommentMessage = { id: newItemId(), author: user, text, at: Date.now() };
    if (mentioned.length) message.mentions = mentioned.map((p) => p.id);
    let thread: CommentThread | undefined;
    if (threadId) {
      const next = replyToComment(doc, threadId, message);
      commit(next);
      thread = next.comments?.find((t) => t.id === threadId);
    } else if (draftComment) {
      const id = newItemId();
      thread = { id, ...draftComment, messages: [message] };
      commit(addComment(doc, thread));
      setDraftComment(null);
      setOpenComment(id);
    }
    if (thread && mentioned.length) props.onMention?.({ thread, message, mentioned });
  };
  const patchLines = (patch: Partial<Pick<LineItem, 'startArrow' | 'endArrow' | 'dashed'>>) => {
    let next = doc;
    for (const id of selection) if (getItem(next, id)?.type === 'line') next = updateItem(next, id, patch);
    commit(next);
  };
  const patchShapes = (patch: Partial<Pick<ShapeItem, 'dashed' | 'fill' | 'align' | 'valign'>>) => {
    let next = doc;
    for (const id of selection) if (getItem(next, id)?.type === 'shape') next = updateItem(next, id, patch);
    commit(next);
  };

  // Clipboard: canvas items as JSON; pasted diagram code becomes a figure, other text a text item.
  useEffect(() => {
    const active = (event: Event) => {
      const root = rootRef.current;
      return !!root && root.contains(document.activeElement) && !isTyping(event.target) && !editing && !entered && !readOnlyRef.current;
    };
    const selectedItems = () => docRef.current.items.filter((i) => selectionRef.current.includes(i.id));
    const onCopy = (event: ClipboardEvent) => {
      if (!active(event) || !selectionRef.current.length) return;
      event.preventDefault();
      // Comments pinned to the copied items travel with them.
      const picked = new Set(selectionRef.current);
      const comments = (docRef.current.comments ?? []).filter((t) => t.item && picked.has(t.item));
      event.clipboardData?.setData('text/plain', JSON.stringify(comments.length ? { version: 1, items: selectedItems(), comments } : { version: 1, items: selectedItems() }));
      if (event.type === 'cut') {
        commit(removeItems(docRef.current, selectionRef.current));
        setSelection([]);
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!active(event)) return;
      const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (image) {
        event.preventDefault();
        void insertImage(image);
        return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      event.preventDefault();
      try {
        const parsed: unknown = JSON.parse(text);
        if (isCanvasDocument(parsed)) {
          const { items, comments } = cloneWithComments(parsed, 24, 24);
          if (!comments.length) insert(items);
          else {
            commit(resolveLines({ ...addItems(docRef.current, items), comments: [...(docRef.current.comments ?? []), ...comments] }));
            setSelection(items.map((i) => i.id));
          }
          return;
        }
      } catch {
        // Not JSON.
      }
      const c = viewportCenter();
      const looksLikeDiagram = /[>{[]/.test(text) && text.split('\n').length > 1;
      if (looksLikeDiagram) insert([newFigure(text)]);
      else {
        const size = measureTextBox(text, 20, theme.font.sans, theme.text.node.weight);
        insert([{ ...newText(c), text, ...size, x: c.x - size.w / 2, y: c.y - size.h / 2 }]);
      }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, entered, commit, insert, insertImage, setSelection, theme]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (isTyping(event.target) || paletteOpen) return;
    const mod = event.metaKey || event.ctrlKey;
    if (entered) {
      // The figure handles its own keys (drill-up on Escape); leave when it didn't.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setEntered(null);
        rootRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (presenting !== null) {
      const go = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[event.key];
      if (go) {
        event.preventDefault();
        goToSlide(presenting + go);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        goToSlide(event.key === 'Home' ? 0 : slides.length - 1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        stopPresenting();
        return;
      }
      if (key === 'l' && !mod) {
        setLaser((on) => !on);
        return;
      }
      if (key === 'n' && !mod) {
        setNotesOpen((on) => !on);
        return;
      }
    }
    if (readOnly) {
      // Only viewing keys.
      if (mod && (event.key === '=' || event.key === '+' || event.key === '-')) {
        event.preventDefault();
        zoomAt(cam.k * (event.key === '-' ? 1 / 1.25 : 1.25));
      } else if ((event.shiftKey && event.key === '!') || (mod && event.key === '0')) {
        event.preventDefault();
        zoomToFit();
      }
      return;
    }
    if (event.key === ' ') {
      spaceHeld.current = true;
      event.preventDefault();
      return;
    }
    if (mod && key === 'z') {
      event.preventDefault();
      (event.shiftKey ? onRedo : onUndo)?.();
    } else if (mod && key === 'y') {
      event.preventDefault();
      onRedo?.();
    } else if (mod && key === 'd') {
      event.preventDefault();
      duplicateSelected();
    } else if (mod && key === 'a') {
      event.preventDefault();
      setSelection(doc.items.map((i) => i.id));
    } else if (mod && key === 'k') {
      event.preventDefault();
      setPaletteOpen(true);
    } else if (event.key === '/' && !mod) {
      event.preventDefault();
      setPaletteOpen(true);
    } else if (event.key === ']' || event.key === '[') {
      event.preventDefault();
      if (selection.length) arrange(event.key === ']' ? (mod ? 'front' : 'forward') : mod ? 'back' : 'backward');
    } else if (mod && (event.key === '=' || event.key === '+' || event.key === '-')) {
      event.preventDefault();
      zoomAt(cam.k * (event.key === '-' ? 1 / 1.25 : 1.25));
    } else if ((event.shiftKey && event.key === '!') || (mod && event.key === '0')) {
      event.preventDefault();
      zoomToFit();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Escape') {
      setSelection([]);
      setTool('select');
    } else if (event.key === 'Enter' && selection.length === 1) {
      const item = getItem(doc, selection[0]!);
      event.preventDefault();
      if (item?.type === 'figure') enterFigure(item.id);
      else if (item) setEditing(item.id);
    } else if (event.key.startsWith('Arrow') && selection.length) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      commit(moveItems(doc, selection, dx, dy));
    } else if (event.shiftKey && !mod && key === 'r' && selection.length) {
      event.preventDefault();
      rotateSelected(90);
    } else if (!mod && !event.altKey && TOOL_KEYS[key]) {
      setTool(TOOL_KEYS[key]!);
    }
  };
  const onKeyUp = (event: ReactKeyboardEvent) => {
    if (event.key === ' ') spaceHeld.current = false;
  };

  // ---- text editing ----
  const editingItem = editing ? getItem(doc, editing) : undefined;
  const finishEditing = (value: string) => {
    const item = editing ? getItem(docRef.current, editing) : undefined;
    setEditing(null);
    if (!item) return;
    if (item.type === 'text') {
      if (!value.trim()) {
        commit(removeItems(docRef.current, [item.id]));
        setSelection([]);
        return;
      }
      const size = measureTextBox(value, item.fontSize, theme.font.sans, theme.text.node.weight);
      commit(updateItem(docRef.current, item.id, { text: value, ...size }));
    } else if ((item.type === 'shape' || item.type === 'line') && value !== (item.text ?? '')) {
      commit(updateItem(docRef.current, item.id, { text: value || undefined }));
    } else if (item.type === 'sticky' && value !== item.text) {
      commit(updateItem(docRef.current, item.id, { text: value }));
    } else if (item.type === 'code' && value !== item.text) {
      // Grow the block to fit its lines.
      const size = measureTextBox(value, CODE_FONT_SIZE, theme.font.mono, 400);
      commit(updateItem(docRef.current, item.id, { text: value, w: Math.max(item.w, size.w + 28), h: Math.max(item.h, Math.ceil(value.split('\n').length * CODE_FONT_SIZE * 1.5) + 28) }));
    }
    rootRef.current?.focus({ preventScroll: true });
  };

  // ---- figures ----
  const onFigureSize = useCallback(
    (id: string, size: { width: number; height: number }) => {
      const item = getItem(docRef.current, id);
      if (!item || item.type !== 'figure' || item.autoSize === false) return;
      if (Math.abs(item.w - size.width) < 1 && Math.abs(item.h - size.height) < 1) return;
      const next = resolveLines(updateItem(docRef.current, id, { w: size.width, h: size.height }));
      commit(next, { silent: true });
      if (followFigure.current === id) {
        followFigure.current = null;
        cameraTouched.current = true;
        fitBox({ ...item, w: size.width, h: size.height });
      } else if (!cameraTouched.current) {
        const all = boundsOf(next.items);
        if (all) fitBox(all);
      }
    },
    [commit, fitBox],
  );

  const registerFigure = useCallback((id: string, handle: OctoDiagramHandle | null) => {
    if (handle) figureRefs.current.set(id, handle);
    else figureRefs.current.delete(id);
  }, []);
  const resolvedCount = (doc.comments ?? []).filter((c) => c.resolved).length;

  const onFigurePlacements = useCallback((id: string, placements: ViewPlacements) => commit(updateItem(docRef.current, id, { placements })), [commit]);

  // ---- presentation mode (continued) ----
  const [camGliding, setCamGliding] = useState(false);
  const [presentDrawIn, setPresentDrawIn] = useState<{ id: string; nonce: number } | null>(null);
  const activeDrawIn = presenting !== null ? presentDrawIn : drawIn;
  const [barVisible, setBarVisible] = useState(true);
  const savedCam = useRef<Camera | null>(null);
  const glideTimer = useRef(0);
  const presentChange = useRef(props.onPresentChange);
  presentChange.current = props.onPresentChange;
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  const showSlide = (index: number, glide: boolean) => {
    const slide = slides[index];
    if (!slide) return;
    cameraTouched.current = true;
    if (glide) {
      setCamGliding(true);
      window.clearTimeout(glideTimer.current);
      glideTimer.current = window.setTimeout(() => setCamGliding(false), 650);
    }
    fitBox(slide.box, 2);
  };
  const goToSlide = (index: number) => {
    const next = clamp(index, 0, slides.length - 1);
    if (next === presentingRef.current) return;
    setEntered(null);
    setPresenting(next);
    showSlide(next, true);
    const slide = slides[next];
    // Diagrams draw themselves in as they come up.
    if (slide?.figure && slide.id) setPresentDrawIn({ id: slide.id, nonce: Date.now() });
    presentChange.current?.(next);
  };
  const startPresenting = (start?: number) => {
    if (!slides.length) return;
    // Start at the selected figure or frame, if one is selected.
    const selectedSlide = slides.findIndex((s) => s.id && selection.includes(s.id));
    const index = clamp(start ?? (selectedSlide >= 0 ? selectedSlide : 0), 0, slides.length - 1);
    savedCam.current = camRef.current;
    setSelection([]);
    setEditing(null);
    setEntered(null);
    setPaletteOpen(false);
    setPresenting(index);
    setBarVisible(true);
    const slide = slides[index]!;
    if (slide.figure && slide.id) setPresentDrawIn({ id: slide.id, nonce: Date.now() });
    rootRef.current?.requestFullscreen?.().catch(() => {});
    rootRef.current?.focus({ preventScroll: true });
    showSlide(index, false);
    setPresentStartedAt(Date.now());
    presentChange.current?.(index);
  };
  /** A picture of a slide for the presenter view: the items inside its box, figures drawn from their code. */
  const slidePreview = useCallback(
    async (slide: ReturnType<typeof presentationSlides>[number]): Promise<string> => {
      const current = docRef.current;
      const items = slide.id === null ? current.items : current.items.filter((i) => i.id === slide.id || (i.type !== 'line' && boxContains(slide.box, i)));
      const figureSvgs = new Map<string, string>();
      for (const item of items) if (item.type === 'figure') figureSvgs.set(item.id, (await renderSourceSvg(item.source, { theme, icons, iconSet, placements: item.placements })).svg);
      const { svg } = renderCanvasSvg(current, { theme, icons, iconSet, figureSvgs, ids: items.map((i) => i.id), padding: 16 });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },
    [theme, icons, iconSet],
  );
  const openPresenterView = () => {
    if (presenterWinRef.current && !presenterWinRef.current.closed) {
      presenterWinRef.current.focus();
      return;
    }
    const win = window.open('', 'octodraw-presenter', 'width=960,height=620');
    if (!win) return;
    win.document.title = 'Presenter view';
    win.document.body.innerHTML = '';
    const style = win.document.createElement('style');
    style.textContent = PRESENTER_CSS;
    win.document.head.appendChild(style);
    win.addEventListener('pagehide', () => setPresenterWin(null));
    setNotesOpen(false);
    setPresenterWin(win);
  };
  const stopPresenting = () => {
    if (presentingRef.current === null) return;
    presenterWinRef.current?.close();
    setPresenterWin(null);
    setPresenting(null);
    setPresentDrawIn(null);
    setEntered(null);
    if (document.fullscreenElement && document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => {});
    if (savedCam.current) setCam(savedCam.current);
    presentChange.current?.(null);
  };
  const presentApi = useRef({ start: startPresenting, stop: stopPresenting, goTo: goToSlide, show: showSlide });
  presentApi.current = { start: startPresenting, stop: stopPresenting, goTo: goToSlide, show: showSlide };
  // Leaving full screen (the browser's own Esc) ends the presentation; size changes re-fit the slide.
  useEffect(() => {
    const onFullscreen = () => {
      // Opening the presenter window can drop full screen; keep presenting then.
      if (!document.fullscreenElement && presentingRef.current !== null && !presenterWinRef.current) presentApi.current.stop();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || presenting === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => presentingRef.current !== null && presentApi.current.show(presentingRef.current, false));
    observer.observe(el);
    return () => observer.disconnect();
  }, [presenting === null]); // eslint-disable-line react-hooks/exhaustive-deps
  // The laser trail fades: drop old points every frame while there are any.
  useEffect(() => {
    if (!laserTrail.length) return;
    const frame = requestAnimationFrame(() => {
      const now = performance.now();
      setLaserTrail((trail) => (trail.length && now - trail.at(-1)!.t > 1500 ? [] : trail.filter((p, i) => i === trail.length - 1 || now - p.t < 500)));
    });
    return () => cancelAnimationFrame(frame);
  }, [laserTrail]);
  useEffect(() => {
    if (presenting === null) {
      setLaser(false);
      setLaserTrail([]);
    }
  }, [presenting]);
  // Arrow keys in the presenter window drive the presentation too.
  useEffect(() => {
    if (!presenterWin) return;
    const onKey = (event: KeyboardEvent) => {
      const at = presentingRef.current;
      if (at === null) return;
      const go = ({ ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 } as Record<string, number>)[event.key];
      if (go) {
        event.preventDefault();
        presentApi.current.goTo(at + go);
      } else if (event.key === 'Escape') presentApi.current.stop();
    };
    presenterWin.addEventListener('keydown', onKey);
    // Closing the window (or the browser killing it) leaves presenter mode.
    const poll = window.setInterval(() => presenterWin.closed && setPresenterWin(null), 1000);
    return () => {
      presenterWin.removeEventListener('keydown', onKey);
      window.clearInterval(poll);
    };
  }, [presenterWin]);
  // The bar fades out while the pointer rests.
  useEffect(() => {
    if (presenting === null) return;
    const el = rootRef.current;
    let timer = window.setTimeout(() => setBarVisible(false), 2500);
    const wake = () => {
      setBarVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBarVisible(false), 2500);
    };
    el?.addEventListener('pointermove', wake);
    el?.addEventListener('pointerdown', wake);
    return () => {
      window.clearTimeout(timer);
      el?.removeEventListener('pointermove', wake);
      el?.removeEventListener('pointerdown', wake);
    };
  }, [presenting === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- rendering ----
  // Nothing is selected in read-only views (a host-controlled selection may still name items).
  const selectedItems = readOnly ? [] : shown.items.filter((i) => selection.includes(i.id));
  // Which figures get a live OctoDiagram: those within a screen's distance of the view, plus any being worked on.
  const liveArea = rootSize.w ? { x: (-cam.x - rootSize.w) / cam.k, y: (-cam.y - rootSize.h) / cam.k, w: (rootSize.w * 3) / cam.k, h: (rootSize.h * 3) / cam.k } : null;
  const figureLive = (item: CanvasItem) => !liveArea || boxesIntersect(item, liveArea) || entered === item.id || selection.includes(item.id) || activeDrawIn?.id === item.id || presenting !== null;
  const enteredFigure = entered ? (shown.items.find((i) => i.id === entered && i.type === 'figure') as FigureItem | undefined) : undefined;
  const selBox = boundsOf(selectedItems);
  const single = selectedItems.length === 1 ? selectedItems[0]! : undefined;
  const k = cam.k;
  const cursor = presenting !== null && laser ? 'none' : panning ? 'grabbing' : tool === 'hand' || spaceHeld.current ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'comment' ? 'copy' : 'crosshair';
  const groupHandles = selectedItems.length > 1 && selBox && !selectedItems.some((i) => i.locked);
  const rotatable = selectedItems.some(canRotate) && !selectedItems.some((i) => i.locked) && !entered && !editing;
  const turn = (item: Box & { rotation?: number }) => (item.rotation ? `rotate(${item.rotation} ${item.x + item.w / 2} ${item.y + item.h / 2})` : undefined);
  const canConvert = selectedItems.filter((i) => i.type === 'shape' || i.type === 'sticky' || i.type === 'icon').length >= 2;

  const onDrop = (event: React.DragEvent) => {
    if (readOnly) return;
    const files = [...event.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    const at = toWorld(event.clientX, event.clientY);
    files.forEach((file, i) => void insertImage(file, { x: at.x + i * 24, y: at.y + i * 24 }));
  };
  const downloadExport = async (format: 'png' | 'svg' | 'pdf', mode: 'download' | 'copy' = 'download') => {
    setExportOpen(false);
    const ids = selection.length ? selection : undefined;
    // PDF uses jsPDF's standard fonts, so don't embed web fonts for it.
    const { svg, width, height } = await exportSvg({ ids, embedFonts: format !== 'pdf' });
    if (mode === 'copy' && format === 'svg') return copyText(svg);
    const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : format === 'pdf' ? await svgToPdf(svg, width, height) : await svgToPng(svg, width, height, 2);
    if (mode === 'copy') return copyBlob(blob);
    downloadBlob(blob, `canvas.${format}`);
  };
  /** Exports one figure through its own diagram (every format the diagram supports). */
  const exportFigure = (id: string, action: { download: ExportFormat } | { copy: CopyFormat }) => {
    const handle = figureRefs.current.get(id);
    const item = getItem(docRef.current, id);
    if (!handle || item?.type !== 'figure') return;
    const name = (figureTitle(item.source) ?? 'diagram').replace(/[^\w.-]+/g, '-').toLowerCase();
    void ('download' in action ? handle.download(action.download, `${name}.${action.download === 'json' ? 'json' : action.download}`) : handle.copy(action.copy));
  };
  const gridSize = 24 * k;

  return (
    <div
      ref={rootRef}
      className={`occ-root${className ? ` ${className}` : ''}`}
      tabIndex={0}
      data-tool={tool}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (presenting !== null && laser) {
          const rect = rootRef.current!.getBoundingClientRect();
          const now = performance.now();
          setLaserTrail((trail) => [...trail.filter((p) => now - p.t < 500), { x: e.clientX - rect.left, y: e.clientY - rect.top, t: now }]);
        }
        if (props.onPresenceChange) reportCursor(toWorld(e.clientX, e.clientY));
      }}
      onPointerLeave={props.onPresenceChange ? () => reportCursor(null) : undefined}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onClick={(e) => {
        // After a toolbar action (whose button may be gone now), give keyboard focus back to the canvas.
        if (!(e.target as Element).closest('.occ-chrome button')) return;
        setTimeout(() => {
          const active = document.activeElement;
          if (!active || active === document.body || !active.isConnected) rootRef.current?.focus({ preventScroll: true });
        }, 0);
      }}
      onDrop={onDrop}
      style={{
        ...cssVars,
        colorScheme: scheme,
        cursor,
        background: theme.color.canvas,
        backgroundImage: grid && k > 0.3 ? `radial-gradient(${theme.color.grid} ${Math.max(1, 1.2 * k)}px, transparent 0)` : undefined,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${cam.x}px ${cam.y}px`,
        fontFamily: theme.font.sans,
        ...style,
      }}
    >
      <style>{CSS}</style>
      {props.ghosts && props.ghosts.length > 0 && <style>{`${props.ghosts.map((id) => `.occ-world [data-item-id="${id.replace(/["\\]/g, '')}"]`).join(',')} { opacity: 0.3; filter: grayscale(1); }`}</style>}
      <div className={`occ-world${camGliding ? ' occ-world-glide' : ''}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${k})` }}>
        {shown.items.map((item) => {
          switch (item.type) {
            case 'shape':
              return <ShapeView key={item.id} item={item} ctx={ctx} hideText={editing === item.id} />;
            case 'text':
              return <TextView key={item.id} item={item} ctx={ctx} hidden={editing === item.id} />;
            case 'pen':
              return <PenView key={item.id} item={item} ctx={ctx} />;
            case 'line':
              return <LineView key={item.id} item={item} doc={shown} ctx={ctx} />;
            case 'icon':
              return <IconView key={item.id} item={item} ctx={ctx} />;
            case 'sticky':
              return <StickyView key={item.id} item={item} ctx={ctx} hideText={editing === item.id} />;
            case 'image':
              return <ImageView key={item.id} item={item} />;
            case 'frame':
              return <FrameView key={item.id} item={item} ctx={ctx} />;
            case 'code':
              return <CodeView key={item.id} item={item} ctx={ctx} hideText={editing === item.id} />;
            case 'figure':
              // Figures well outside the view are drawn as light placeholders instead of full diagrams.
              if (!figureLive(item))
                return (
                  <div key={item.id} data-item-id={item.id} className="occ-item occ-figure occ-figure-parked" style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h }}>
                    <div className="occ-figure-tab">{figureTitle(item.source) ?? KIND_LABEL[detectDiagramType(item.source)]}</div>
                  </div>
                );
              return (
                <FigureView
                  key={activeDrawIn?.id === item.id ? `${item.id}:${activeDrawIn.nonce}` : item.id}
                  item={item}
                  entered={entered === item.id && !compact}
                  selected={selection.includes(item.id)}
                  drawIn={activeDrawIn?.id === item.id}
                  scheme={scheme}
                  themes={props.themes}
                  icons={icons}
                  iconSet={iconSet}
                  figureProps={figureProps}
                  onSize={onFigureSize}
                  onAskAi={onAskAi}
                  register={registerFigure}
                  onPlacements={onFigurePlacements}
                />
              );
          }
        })}

        <svg className="occ-overlay" width={1} height={1}>
          {props.highlights &&
            shown.items.map((item) => {
              const color = props.highlights![item.id];
              if (!color) return null;
              if (item.type === 'line') {
                return <path key={`hl-${item.id}`} d={linePath(lineGeometry(shown, item))} fill="none" stroke={color} strokeWidth={6 / k} strokeOpacity={0.45} strokeLinecap="round" />;
              }
              return <rect key={`hl-${item.id}`} x={item.x - 6 / k} y={item.y - 6 / k} width={item.w + 12 / k} height={item.h + 12 / k} transform={turn(item)} rx={6 / k} fill={color} fillOpacity={0.08} stroke={color} strokeWidth={2 / k} />;
            })}
          {props.peers?.map((peer) => {
            const picked = shown.items.filter((i) => peer.selection?.includes(i.id));
            const bounds = boundsOf(picked);
            if (!bounds) return null;
            return (
              <g key={`peer-${peer.clientId}`} className="occ-peer-selection">
                {picked.map((item) =>
                  item.type === 'line' ? (
                    <path key={item.id} d={linePath(lineGeometry(shown, item))} fill="none" stroke={peer.color} strokeWidth={3 / k} strokeOpacity={0.5} />
                  ) : (
                    <rect key={item.id} x={item.x - 3 / k} y={item.y - 3 / k} width={item.w + 6 / k} height={item.h + 6 / k} transform={turn(item)} fill="none" stroke={peer.color} strokeWidth={1.5 / k} rx={4 / k} />
                  ),
                )}
              </g>
            );
          })}
          {selectedItems.map((item) =>
            item.type === 'line' ? null : (
              <rect key={item.id} x={item.x} y={item.y} width={item.w} height={item.h} transform={turn(item)} fill="none" stroke={theme.color.accent} strokeWidth={1.5 / k} rx={item.type === 'figure' ? 8 : 2} />
            ),
          )}
          {selectedItems.length > 1 && selBox && <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill="none" stroke={theme.color.accent} strokeWidth={1 / k} strokeDasharray={`${4 / k} ${3 / k}`} />}
          {groupHandles && !preview &&
            HANDLES.map((h) => {
              const hx = selBox!.x + (h.includes('w') ? 0 : h.includes('e') ? selBox!.w : selBox!.w / 2);
              const hy = selBox!.y + (h.includes('n') ? 0 : h.includes('s') ? selBox!.h : selBox!.h / 2);
              const size = handle / k;
              return <rect key={h} data-handle={h} data-for="__group__" className={`occ-handle occ-handle-${h}`} x={hx - size / 2} y={hy - size / 2} width={size} height={size} rx={2 / k} fill={theme.color.raised} stroke={theme.color.accent} strokeWidth={1.5 / k} />;
            })}
          {guides?.x && <line x1={guides.x.at} y1={guides.x.from - 8 / k} x2={guides.x.at} y2={guides.x.to + 8 / k} stroke={theme.palette.pink.solid} strokeWidth={1 / k} />}
          {guides?.y && <line x1={guides.y.from - 8 / k} y1={guides.y.at} x2={guides.y.to + 8 / k} y2={guides.y.at} stroke={theme.palette.pink.solid} strokeWidth={1 / k} />}
          {single && !single.locked && !entered && editing !== single.id && single.type !== 'line' && (
            <g transform={turn(single)}>
              {HANDLES.map((h) => {
                const hx = single.x + (h.includes('w') ? 0 : h.includes('e') ? single.w : single.w / 2);
                const hy = single.y + (h.includes('n') ? 0 : h.includes('s') ? single.h : single.h / 2);
                const size = handle / k;
                return <rect key={h} data-handle={h} data-for={single.id} className={`occ-handle occ-handle-${h}`} style={single.rotation ? { cursor: resizeCursor(h, single.rotation) } : undefined} x={hx - size / 2} y={hy - size / 2} width={size} height={size} rx={2 / k} fill={theme.color.raised} stroke={theme.color.accent} strokeWidth={1.5 / k} />;
              })}
            </g>
          )}
          {rotatable && (!preview || rotating !== null) && (() => {
            // A round handle above the top edge (of the item, turned with it, or of the group box).
            const frame = single ?? { ...selBox!, rotation: undefined };
            const cx = frame.x + frame.w / 2;
            const top = frame.y - 24 / k;
            return (
              <g transform={turn(frame)}>
                <line x1={cx} y1={frame.y} x2={cx} y2={top} stroke={theme.color.accent} strokeWidth={1 / k} />
                <circle data-handle="rotate" data-for={frame === single ? single.id : '__group__'} className="occ-handle occ-handle-rotate" cx={cx} cy={top} r={(handle * 0.6) / k} fill={theme.color.raised} stroke={theme.color.accent} strokeWidth={1.5 / k}>
                  <title>Rotate (Shift snaps to 15°)</title>
                </circle>
              </g>
            );
          })()}
          {single?.type === 'line' &&
            (() => {
              const g = lineGeometry(shown, single);
              return (
                <>
                  {(['start', 'end'] as const).map((which) => (
                    <circle key={which} data-handle={which} data-for={single.id} className="occ-handle occ-handle-point" cx={g[which].x} cy={g[which].y} r={(handle * 0.6) / k} fill={theme.color.raised} stroke={theme.color.accent} strokeWidth={1.5 / k} />
                  ))}
                  {/* Drag the middle to bend the line (back near the straight line to straighten it). */}
                  {!single.locked && (
                    <circle data-handle="bend" data-for={single.id} className="occ-handle occ-handle-bend" cx={g.mid.x} cy={g.mid.y} r={(handle * 0.45) / k} fill={theme.color.accent} stroke={theme.color.raised} strokeWidth={1.5 / k}>
                      <title>Drag to curve</title>
                    </circle>
                  )}
                </>
              );
            })()}
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={theme.color.accentSoft} fillOpacity={0.5} stroke={theme.color.accent} strokeWidth={1 / k} />}
        </svg>

        {rotating !== null && selBox && (
          <div className="occ-angle" style={{ left: selBox.x + selBox.w / 2, top: selBox.y + selBox.h + 12 / k, transform: `translateX(-50%) scale(${1 / k})` }}>
            {rotating}°
          </div>
        )}
        {editingItem && <TextEditor item={editingItem} theme={theme} onDone={finishEditing} />}
      </div>

      {props.peers && props.peers.length > 0 && (
        <div className="occ-peers" aria-hidden="true">
          {props.peers.map((peer) => {
            const picked = shown.items.filter((i) => peer.selection?.includes(i.id));
            const bounds = boundsOf(picked);
            return (
              <div key={peer.clientId}>
                {bounds && (
                  <span className="occ-peer-tag" style={{ left: cam.x + bounds.x * k, top: cam.y + bounds.y * k, background: peer.color }}>
                    {peer.name}
                  </span>
                )}
                {peer.cursor && peer.laser && (
                  <div className="occ-peer-cursor occ-peer-laser" style={{ transform: `translate(${cam.x + peer.cursor.x * k}px, ${cam.y + peer.cursor.y * k}px)` }} title={peer.name} />
                )}
                {peer.cursor && !peer.laser && (
                  <div className="occ-peer-cursor" style={{ transform: `translate(${cam.x + peer.cursor.x * k}px, ${cam.y + peer.cursor.y * k}px)` }}>
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path d="M2 1.5l13 6.2-5.6 1.6L7 15z" fill={peer.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                    <span style={{ background: peer.color }}>{peer.name}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {doc.items.length === 0 && !preview && !readOnly && <TemplateGallery templates={templates} theme={theme} icons={icons} iconSet={iconSet} onPick={insertTemplate} onInsert={() => setPaletteOpen(true)} />}

      {!readOnly && <ToolRail tool={tool} onTool={setTool} onInsert={() => setPaletteOpen(true)} />}

      {selBox && !preview && !editing && !entered && !readOnly && (
        <SelectionBar
          box={selBox}
          cam={cam}
          items={selectedItems}
          theme={theme}
          arrangeOpen={arrangeOpen}
          onArrangeToggle={() => (setFigureExportOpen(false), setArrangeOpen((o) => !o))}
          onArrange={arrange}
          onRotate={rotatable ? rotateSelected : undefined}
          onExportFigure={single?.type === 'figure' ? (action) => (setFigureExportOpen(false), exportFigure(single.id, action)) : undefined}
          exportOpen={figureExportOpen}
          onExportToggle={() => (setArrangeOpen(false), setFigureExportOpen((o) => !o))}
          clearance={rotatable ? 30 : 0}
          onColor={recolor}
          onLine={patchLines}
          onShape={patchShapes}
          onDuplicate={duplicateSelected}
          onDelete={removeSelected}
          onOpenFigure={single?.type === 'figure' && onOpenFigure ? () => onOpenFigure(single.id) : undefined}
          onAskAi={single?.type === 'figure' && onAskAi ? () => onAskAi(single.id) : undefined}
          onEnter={single?.type === 'figure' ? () => enterFigure(single.id) : undefined}
          onFormatText={formatText}
          onToFigure={canConvert ? toFigure : undefined}
          onComment={single ? () => commentOn(single) : undefined}
        />
      )}

      {!readOnly && <CommentLayer
        doc={doc}
        cam={cam}
        open={openComment}
        draft={draftComment}
        showResolved={showResolved}
        onOpen={setOpenComment}
        onCancelDraft={() => setDraftComment(null)}
        onPost={postComment}
        people={props.people?.filter((p) => p.id !== user.id)}
        onResolve={(id, resolved) => {
          commit(updateComment(doc, id, { resolved }));
          if (resolved && !showResolved) setOpenComment(null);
        }}
        onDelete={(id) => {
          commit(removeComment(doc, id));
          setOpenComment(null);
        }}
      />}
      <input
        ref={filePicker}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImage(file);
          e.target.value = '';
        }}
      />
      {entered && compact && enteredFigure && (
        // Small screens: the opened figure fills the canvas at its own scale, with its own pan and zoom.
        <div className="occ-focus">
          <OctoDiagram
            {...figureProps}
            source={enteredFigure.source}
            placements={enteredFigure.placements ?? EMPTY_PLACEMENTS}
            onPlacementsChange={(next) => onFigurePlacements(enteredFigure.id, next)}
            colorScheme={scheme}
            themes={props.themes}
            icons={icons}
            iconSet={iconSet}
            detailsPanel={false}
            onSelect={figureProps?.onSelect ?? noop}
            onAskAi={onAskAi ? () => onAskAi(enteredFigure.id) : undefined}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
      {entered && (
        <div className="occ-entered occ-chrome">
          <span className="occ-entered-hint">Inside the figure: drill down, collapse, play flows</span>
          <button type="button" className="occ-button" onClick={() => setEntered(null)}>
            Done <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {presenting !== null && slides[presenting] && (
        <div className={`occ-present-bar occ-chrome${barVisible ? '' : ' occ-present-bar-hidden'}`} role="toolbar" aria-label="Presentation">
          <button type="button" className="occ-icon-button" onClick={() => goToSlide(presenting - 1)} disabled={presenting === 0} aria-label="Previous slide">
            <Glyph d="M15 6l-6 6 6 6" />
          </button>
          <span className="occ-present-count">
            {presenting + 1} / {slides.length}
          </span>
          <span className="occ-present-title">{slides[presenting]!.title}</span>
          <button type="button" className="occ-icon-button" onClick={() => goToSlide(presenting + 1)} disabled={presenting >= slides.length - 1} aria-label="Next slide">
            <Glyph d="M9 6l6 6-6 6" />
          </button>
          <span className="occ-corner-sep" />
          <button type="button" className="occ-icon-button" aria-pressed={laser} onClick={() => setLaser((on) => !on)} title="Laser pointer (L)" aria-label="Laser pointer">
            <Glyph d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 3v3M12 18v3M3 12h3M18 12h3" />
          </button>
          <button type="button" className="occ-icon-button" aria-pressed={notesOpen} onClick={() => setNotesOpen((on) => !on)} title="Speaker notes (N)" aria-label="Speaker notes">
            <Glyph d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
          </button>
          <button type="button" className="occ-icon-button" aria-pressed={!!presenterWin} onClick={openPresenterView} title="Presenter view: notes, next slide and timer in a separate window" aria-label="Presenter view">
            <Glyph d="M3 5h12v9H3zM17 9h4v10h-9v-3M6 18h6" />
          </button>
          <button type="button" className="occ-bar-btn" onClick={stopPresenting} title="Stop presenting (Esc)">
            End
          </button>
        </div>
      )}
      {presenting !== null && presenterWin && createPortal(<PresenterView slides={slides} index={presenting} startedAt={presentStartedAt} onGo={goToSlide} onEnd={stopPresenting} preview={slidePreview} />, presenterWin.document.body)}
      {presenting !== null && notesOpen && (
        <div className="occ-present-notes occ-chrome" aria-label="Speaker notes">
          {slides[presenting]?.notes ? slides[presenting]!.notes : <span className="occ-muted">No notes for this slide. Add them in the Slides panel.</span>}
        </div>
      )}
      {presenting !== null && laser && laserTrail.length > 0 && (
        <svg className="occ-laser" aria-hidden="true">
          <polyline points={laserTrail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.45} />
          <circle cx={laserTrail.at(-1)!.x} cy={laserTrail.at(-1)!.y} r={7} fill="#ef4444" />
          <circle cx={laserTrail.at(-1)!.x} cy={laserTrail.at(-1)!.y} r={14} fill="#ef4444" opacity={0.25} />
        </svg>
      )}
      {slidesOpen && presenting === null && (
        <SlidesPanel
          slides={allSlides}
          canEdit={!readOnly}
          onClose={() => setSlidesOpen(false)}
          onPresent={(index) => (setSlidesOpen(false), startPresenting(index))}
          onShow={(slide) => {
            cameraTouched.current = true;
            fitBox(slide.box);
          }}
          onMove={(id, to) => commit(moveSlide(docRef.current, id, to))}
          onHidden={(id, hidden) => commit(setSlideHidden(docRef.current, id, hidden))}
          onNotes={(id, notes) => commit(setSlideNotes(docRef.current, id, notes))}
        />
      )}
      {presenting === null && <div className="occ-corner occ-corner-left occ-chrome">
        {onUndo && !readOnly && (
          <button type="button" className="occ-icon-button" onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo">
            <Glyph d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </button>
        )}
        {onRedo && !readOnly && (
          <button type="button" className="occ-icon-button" onClick={onRedo} title="Redo (⇧⌘Z)" aria-label="Redo">
            <Glyph d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </button>
        )}
        {resolvedCount > 0 && (
          <button type="button" className="occ-bar-btn" aria-pressed={showResolved} onClick={() => setShowResolved((v) => !v)} title="Show resolved comments">
            <Glyph d="M4 5h16v11H9l-5 4z" /> {resolvedCount} resolved
          </button>
        )}
      </div>}
      {presenting === null && <div className="occ-corner occ-corner-right occ-chrome">
        {allSlides.length > 0 && (
          <button type="button" className="occ-bar-btn" aria-pressed={slidesOpen} onClick={() => setSlidesOpen((o) => !o)} title="Slides: order, hide and add notes">
            <Glyph d="M4 5h16v10H4zM8 19h8M12 15v4" /> Slides
          </button>
        )}
        {slides.length > 0 && (
          <button type="button" className="occ-bar-btn" onClick={() => startPresenting()} title="Present: show the figures and frames one at a time, full screen">
            <Glyph d="M7 5l12 7-12 7z" /> Present
          </button>
        )}
        <span className="occ-menu-anchor">
          <button type="button" className="occ-bar-btn" onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen} title={selection.length ? 'Export the selection' : 'Export the canvas'}>
            <Glyph d="M12 4v11M7 10l5 5 5-5M5 20h14" /> Export
          </button>
          {exportOpen && (
            <div className="occ-menu occ-menu-up" role="menu">
              <div className="occ-menu-label">{selection.length ? 'Selection' : 'Whole canvas'}</div>
              <button type="button" role="menuitem" onClick={() => void downloadExport('png')}>
                PNG image
              </button>
              <button type="button" role="menuitem" onClick={() => void downloadExport('svg')}>
                SVG vector
              </button>
              <button type="button" role="menuitem" onClick={() => void downloadExport('pdf')}>
                PDF document
              </button>
              <div className="occ-menu-sep" />
              <button type="button" role="menuitem" onClick={() => void downloadExport('png', 'copy')}>
                Copy as PNG
              </button>
              <button type="button" role="menuitem" onClick={() => void downloadExport('svg', 'copy')}>
                Copy as SVG
              </button>
            </div>
          )}
        </span>
        <span className="occ-corner-sep" />
        <button type="button" className="occ-icon-button" onClick={() => zoomAt(k / 1.25)} aria-label="Zoom out">
          <Glyph d="M5 12h14" />
        </button>
        <button type="button" className="occ-zoom" onClick={zoomToFit} title="Zoom to fit (⇧1)">
          {Math.round(k * 100)}%
        </button>
        <button type="button" className="occ-icon-button" onClick={() => zoomAt(k * 1.25)} aria-label="Zoom in">
          <Glyph d="M12 5v14M5 12h14" />
        </button>
      </div>}

      {paletteOpen && <InsertPalette ctx={ctx} templates={templates} aiEnabled={!!onAskAi} onChoose={choose} onClose={() => (setPaletteOpen(false), rootRef.current?.focus({ preventScroll: true }))} />}
    </div>
  );
}

/** The presenter's window: current slide and notes, what's next, elapsed time, controls. */
function PresenterView({ slides, index, startedAt, onGo, onEnd, preview }: { slides: ReturnType<typeof presentationSlides>; index: number; startedAt: number; onGo: (index: number) => void; onEnd: () => void; preview: (slide: ReturnType<typeof presentationSlides>[number]) => Promise<string> }) {
  const [now, setNow] = useState(() => Date.now());
  // Thumbnail of the next slide (cached per slide).
  const thumbs = useRef(new Map<string, string>());
  const [nextThumb, setNextThumb] = useState<string | null>(null);
  const upcoming = slides[index + 1];
  useEffect(() => {
    if (!upcoming) return setNextThumb(null);
    const key = upcoming.id ?? '';
    const cached = thumbs.current.get(key);
    if (cached) return setNextThumb(cached);
    setNextThumb(null);
    let cancelled = false;
    void preview(upcoming).then((src) => {
      thumbs.current.set(key, src);
      if (!cancelled) setNextThumb(src);
    });
    return () => {
      cancelled = true;
    };
  }, [upcoming, preview]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const slide = slides[index];
  const next = slides[index + 1];
  return (
    <div className="pv">
      <header className="pv-head">
        <span className="pv-count">
          Slide {index + 1} of {slides.length}
        </span>
        <span className="pv-clock" aria-label="Elapsed time">
          {clock}
        </span>
      </header>
      <main className="pv-main">
        <h1>{slide?.title}</h1>
        <div className="pv-notes">{slide?.notes || <span className="pv-muted">No notes for this slide.</span>}</div>
      </main>
      <footer className="pv-foot">
        <div className="pv-next">
          {nextThumb && <img src={nextThumb} alt="" />}
          <div>
            <span className="pv-muted">Next</span> {next ? next.title : 'End of the presentation'}
          </div>
        </div>
        <div className="pv-buttons">
          <button type="button" onClick={() => onGo(index - 1)} disabled={index === 0}>
            ← Previous
          </button>
          <button type="button" className="pv-primary" onClick={() => onGo(index + 1)} disabled={!next}>
            Next →
          </button>
          <button type="button" onClick={onEnd}>
            End
          </button>
        </div>
      </footer>
    </div>
  );
}

const PRESENTER_CSS = `
:root { color-scheme: light dark; }
body { margin: 0; font: 15px/1.5 Inter, system-ui, sans-serif; background: #111113; color: #f4f4f5; }
.pv { display: flex; flex-direction: column; height: 100vh; }
.pv-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #27272a; }
.pv-count { color: #a1a1aa; font-size: 13px; }
.pv-clock { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pv-main { flex: 1; overflow-y: auto; padding: 20px 24px; }
.pv-main h1 { margin: 0 0 14px; font-size: 26px; }
.pv-notes { font-size: 22px; line-height: 1.5; white-space: pre-wrap; }
.pv-muted { color: #71717a; }
.pv-foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 20px; border-top: 1px solid #27272a; }
.pv-next { display: flex; align-items: center; gap: 12px; font-size: 15px; min-width: 0; }
.pv-next img { width: 180px; height: 110px; object-fit: contain; background: #fff; border-radius: 6px; flex: none; }
.pv-buttons { display: flex; gap: 8px; }
.pv-buttons button { font: inherit; font-size: 14px; padding: 8px 14px; border-radius: 8px; border: 1px solid #3f3f46; background: #18181b; color: inherit; cursor: pointer; }
.pv-buttons button:disabled { opacity: 0.4; cursor: default; }
.pv-buttons .pv-primary { background: #2563eb; border-color: #2563eb; color: #fff; }
`;

/** The presentation outline: order (drag or arrows), hide, speaker notes. */
function SlidesPanel(props: {
  slides: ReturnType<typeof presentationSlides>;
  canEdit: boolean;
  onClose: () => void;
  onPresent: (index: number) => void;
  onShow: (slide: ReturnType<typeof presentationSlides>[number]) => void;
  onMove: (id: string, to: number) => void;
  onHidden: (id: string, hidden: boolean) => void;
  onNotes: (id: string, notes: string) => void;
}) {
  const { slides, canEdit } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Present starts at a slide's position among the visible ones.
  const visibleIndex = (i: number) => slides.slice(0, i).filter((s) => !s.hidden).length;
  return (
    <aside className="occ-slides occ-chrome" aria-label="Slides" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <header className="occ-slides-head">
        <span>Slides</span>
        <span className="occ-slides-actions">
          <button type="button" className="occ-button occ-button-primary" onClick={() => props.onPresent(0)} disabled={!slides.some((s) => !s.hidden)}>
            Present
          </button>
          <button type="button" className="occ-icon-button" onClick={props.onClose} aria-label="Close slides">
            ×
          </button>
        </span>
      </header>
      <ol className="occ-slides-list">
        {slides.map((slide, i) => {
          const key = slide.id ?? '';
          return (
            <li
              key={key}
              className={`occ-slide${slide.hidden ? ' occ-slide-hidden' : ''}${dragging === key ? ' occ-slide-dragging' : ''}`}
              draggable={canEdit && !!slide.id}
              onDragStart={(e) => {
                setDragging(key);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== key) props.onMove(dragging, i);
                setDragging(null);
              }}
            >
              <div className="occ-slide-row">
                <span className="occ-slide-num">{i + 1}</span>
                <button type="button" className="occ-slide-title" onClick={() => (props.onShow(slide), setOpen(open === key ? null : key))} title="Show on the canvas; click again for notes">
                  {slide.title}
                  {slide.notes && <span className="occ-slide-has-notes" title="Has notes" />}
                </button>
                {canEdit && slide.id && (
                  <span className="occ-slide-tools">
                    <button type="button" className="occ-icon-button" onClick={() => props.onMove(slide.id!, i - 1)} disabled={i === 0} aria-label="Move up">
                      <Glyph d="M6 15l6-6 6 6" />
                    </button>
                    <button type="button" className="occ-icon-button" onClick={() => props.onMove(slide.id!, i + 1)} disabled={i === slides.length - 1} aria-label="Move down">
                      <Glyph d="M6 9l6 6 6-6" />
                    </button>
                    <button type="button" className="occ-icon-button" aria-pressed={!slide.hidden} onClick={() => props.onHidden(slide.id!, !slide.hidden)} aria-label={slide.hidden ? 'Show in presentation' : 'Hide from presentation'} title={slide.hidden ? 'Hidden: click to include' : 'Hide from the presentation'}>
                      <Glyph d={slide.hidden ? 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a11 11 0 0 1-2.2 3.1M6.6 6.6C4.4 8 3 10.4 3 12c0 2 4 7 9 7a9.7 9.7 0 0 0 4.4-1.1' : 'M3 12c0-2 4-7 9-7s9 5 9 7-4 7-9 7-9-5-9-7zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'} />
                    </button>
                    <button type="button" className="occ-icon-button" onClick={() => props.onPresent(visibleIndex(i))} disabled={slide.hidden} aria-label="Present from here" title="Present from this slide">
                      <Glyph d="M8 5l11 7-11 7z" />
                    </button>
                  </span>
                )}
              </div>
              {open === key && (
                <textarea
                  className="occ-slide-notes"
                  defaultValue={slide.notes ?? ''}
                  placeholder="Speaker notes…"
                  readOnly={!canEdit}
                  rows={3}
                  onBlur={(e) => e.target.value !== (slide.notes ?? '') && props.onNotes(key, e.target.value)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** Shown on an empty canvas: starter boards with small previews. */
function TemplateGallery({ templates, theme, icons, iconSet, onPick, onInsert }: { templates: CanvasTemplate[]; theme: Theme; icons?: IconResolver; iconSet?: IconSet; onPick: (id: string) => void; onInsert: () => void }) {
  const preview = useCallback(
    (items: CanvasItem[], figureSvgs?: Map<string, string>) => {
      const { svg } = renderCanvasSvg({ version: 1, items }, { theme, icons, iconSet, padding: 24, figureSvgs });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },
    [theme, icons, iconSet],
  );
  const built = useMemo(() => templates.map((t) => ({ ...t, items: t.build() })), [templates]);
  // Outlines first, then the real diagrams once they're laid out.
  const [srcs, setSrcs] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    setSrcs(Object.fromEntries(built.map((t) => [t.id, preview(t.items)])));
    void Promise.all(
      built.map(async (t) => {
        const figureSvgs = new Map<string, string>();
        for (const item of t.items) if (item.type === 'figure') figureSvgs.set(item.id, (await renderSourceSvg(item.source, { theme, icons, iconSet, placements: item.placements })).svg);
        return [t.id, preview(t.items, figureSvgs)] as const;
      }),
    ).then((entries) => !cancelled && setSrcs(Object.fromEntries(entries)));
    return () => {
      cancelled = true;
    };
  }, [built, preview, theme, icons, iconSet]);
  const previews = built.map((t) => ({ ...t, src: srcs[t.id] ?? '' }));
  return (
    <div className="occ-empty occ-chrome">
      <p>Start from a template</p>
      <span>Or draw with the tools.</span>
      <div className="occ-gallery">
        {previews.map((t) => (
          <button key={t.id} type="button" className="occ-gallery-card" onClick={() => onPick(t.id)} title={t.hint}>
            <img src={t.src || undefined} alt="" draggable={false} />
            <strong>{t.label}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>
      <button type="button" className="occ-button" onClick={onInsert}>
        Insert a diagram, shape or icon… <kbd>⌘K</kbd>
      </button>
    </div>
  );
}

const FigureView = memo(function FigureView({
  item,
  entered,
  selected,
  drawIn,
  scheme,
  themes,
  icons,
  iconSet,
  figureProps,
  onSize,
  onAskAi,
  register,
  onPlacements,
}: {
  register: (id: string, handle: OctoDiagramHandle | null) => void;
  onPlacements: (id: string, placements: ViewPlacements) => void;
  item: FigureItem;
  entered: boolean;
  selected: boolean;
  drawIn: boolean;
  scheme: ColorScheme;
  themes?: Partial<Record<ColorScheme, Theme>>;
  icons?: IconResolver;
  iconSet: IconSet;
  figureProps?: Partial<OctoDiagramProps>;
  onSize: (id: string, size: { width: number; height: number }) => void;
  onAskAi?: (figureId: string | null) => void;
}) {
  const title = figureTitle(item.source) ?? KIND_LABEL[detectDiagramType(item.source)];
  const onContentSize = useCallback((size: { width: number; height: number }) => onSize(item.id, size), [onSize, item.id]);
  const ref = useCallback((handle: OctoDiagramHandle | null) => register(item.id, handle), [register, item.id]);
  const onPlacementsChange = useCallback((next: ViewPlacements) => onPlacements(item.id, next), [onPlacements, item.id]);
  return (
    <div data-item-id={item.id} className={`occ-item occ-figure${entered ? ' occ-figure-entered' : ''}${selected ? ' occ-figure-selected' : ''}`} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h }}>
      <div className="occ-figure-tab">{title}</div>
      <div className="occ-figure-body" style={{ pointerEvents: entered ? 'auto' : 'none' }}>
        <OctoDiagram
          {...figureProps}
          ref={ref}
          source={item.source}
          placements={item.placements ?? EMPTY_PLACEMENTS}
          onPlacementsChange={onPlacementsChange}
          embedded
          chrome={entered}
          drawIn={drawIn}
          colorScheme={scheme}
          themes={themes}
          icons={icons}
          iconSet={iconSet}
          // The details panel only in opened figures wide enough not to be covered by it.
          detailsPanel={entered && item.w >= 640}
          onSelect={figureProps?.onSelect ?? noop}
          onContentSize={onContentSize}
          onAskAi={onAskAi ? () => onAskAi(item.id) : undefined}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
});

const EMPTY_PLACEMENTS: ViewPlacements = {};
const noop = () => {};
const KIND_LABEL = { flow: 'Diagram', erd: 'Data model', sequence: 'Sequence diagram', bpmn: 'Process' } as const;

/** Where the editor's text starts, matching how the item draws its label. */
function editorPadding(item: CanvasItem, box: Box, textHeight: number): CSSProperties {
  if (item.type === 'sticky') return { paddingTop: Math.max(0, box.h / 2 - textHeight / 2) };
  if (item.type !== 'shape') return { paddingTop: 0 };
  const pad = shapeTextPadding(item);
  const valign = item.valign ?? 'middle';
  const top = valign === 'top' ? pad.y : valign === 'bottom' ? box.h - pad.y - textHeight : box.h / 2 - textHeight / 2;
  return { paddingTop: Math.max(0, top), paddingLeft: item.align === 'left' ? pad.x : 0, paddingRight: item.align === 'right' ? pad.x : 0 };
}

function TextEditor({ item, theme, onDone }: { item: CanvasItem; theme: Theme; onDone: (value: string) => void }) {
  const initial = item.type === 'text' || item.type === 'shape' || item.type === 'line' || item.type === 'sticky' || item.type === 'code' ? (item.text ?? '') : '';
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    // Again next frame, in case the click that opened the editor moved focus after this effect.
    const frame = requestAnimationFrame(() => {
      if (ref.current && document.activeElement !== ref.current) ref.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  const fontSize = item.type === 'text' ? item.fontSize : item.type === 'line' ? theme.text.edge.size : item.type === 'sticky' ? STICKY_FONT_SIZE : item.type === 'code' ? CODE_FONT_SIZE : theme.text.node.size;
  let box: Box = item;
  if (item.type === 'text') {
    const size = measureTextBox(value, item.fontSize, theme.font.sans, item.bold ? 700 : theme.text.node.weight);
    box = { x: item.x, y: item.y, w: Math.max(size.w, 40), h: size.h };
  } else if (item.type === 'code') {
    box = { x: item.x + 14, y: item.y + 14, w: item.w - 28, h: Math.max(item.h - 28, value.split('\n').length * CODE_FONT_SIZE * 1.5 + 4) };
  } else if (item.type === 'sticky') {
    box = { x: item.x + 14, y: item.y + 14, w: item.w - 28, h: item.h - 28 };
  } else if (item.type === 'line') {
    box = { x: item.x + item.w / 2 - 80, y: item.y + item.h / 2 - 14, w: 160, h: 28 };
  }
  return (
    <textarea
      ref={ref}
      className={`occ-editor occ-editor-${item.type}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (item.type === 'code' && e.key === 'Tab') {
          // Indent with two spaces instead of leaving the field.
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = el;
          const next = value.slice(0, a) + '  ' + value.slice(b);
          setValue(next);
          requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
          return;
        }
        const multiline = item.type === 'text' || item.type === 'sticky' || item.type === 'code';
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !multiline))) {
          e.preventDefault();
          finish(value);
        }
      }}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        // Turn with the item, about the item's centre.
        transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
        transformOrigin: `${item.x + item.w / 2 - box.x}px ${item.y + item.h / 2 - box.y}px`,
        font: item.type === 'code' ? `400 ${fontSize}px/1.5 ${theme.font.mono}` : item.type === 'text' ? textFont(theme, item) : `${item.type === 'sticky' ? 500 : theme.text.node.weight} ${fontSize}px/${TEXT_LINE_HEIGHT} ${theme.font.sans}`,
        color: item.type === 'shape' ? shapeColors(theme, item.color, item.fill).text : theme.color.text,
        textAlign: item.type === 'text' ? (item.align ?? 'left') : item.type === 'shape' ? (item.align ?? 'center') : item.type === 'code' ? 'left' : 'center',
        ...editorPadding(item, box, fontSize * TEXT_LINE_HEIGHT * Math.max(1, value.split('\n').length)),
      }}
    />
  );
}

const TOOLS: { tool: CanvasTool; label: string; key: string; d: string }[] = [
  { tool: 'select', label: 'Select', key: 'V', d: 'M5 3l14 8-6.5 1.5L9 19z' },
  { tool: 'hand', label: 'Pan', key: 'H', d: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-8a1.5 1.5 0 0 1 3 0V12M14 7.5a1.5 1.5 0 0 1 3 0V12M17 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.3 14a1.5 1.5 0 0 1 2.5-1.6L8 14' },
  { tool: 'rectangle', label: 'Rectangle', key: 'R', d: 'M4 6h16v12H4z' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', d: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z' },
  { tool: 'diamond', label: 'Diamond', key: 'D', d: 'M12 3l9 9-9 9-9-9z' },
  { tool: 'sticky', label: 'Sticky note', key: 'S', d: 'M5 4h14v10l-6 6H5zM13 20v-6h6' },
  { tool: 'arrow', label: 'Arrow', key: 'A', d: 'M5 19L19 5M10 5h9v9' },
  { tool: 'line', label: 'Line', key: 'L', d: 'M5 19L19 5' },
  { tool: 'pen', label: 'Pen', key: 'P', d: 'M4 20c3-1 4-3 6-6s4-6 6-8 4 0 2 2-5 4-8 6-5 3-6 6z' },
  { tool: 'text', label: 'Text', key: 'T', d: 'M5 6V4h14v2M12 4v16M9 20h6' },
  { tool: 'comment', label: 'Comment', key: 'C', d: 'M4 5h16v11H9l-5 4z' },
];

function ToolRail({ tool, onTool, onInsert }: { tool: CanvasTool; onTool: (t: CanvasTool) => void; onInsert: () => void }) {
  return (
    <div className="occ-rail occ-chrome" role="toolbar" aria-label="Tools" aria-orientation="vertical">
      {TOOLS.map((t, i) => (
        <span key={t.tool} style={{ display: 'contents' }}>
          {(i === 2 || i === 6 || i === 11) && <span className="occ-rail-sep" />}
          <button type="button" className="occ-rail-btn" aria-pressed={tool === t.tool} title={`${t.label} (${t.key})`} aria-label={t.label} onClick={() => onTool(t.tool)}>
            <Glyph d={t.d} />
            <span className="occ-rail-key">{t.key}</span>
          </button>
        </span>
      ))}
      <span className="occ-rail-sep" />
      <button type="button" className="occ-rail-btn occ-rail-insert" title="Insert diagram, shape or icon (⌘K)" aria-label="Insert" onClick={onInsert}>
        <Glyph d="M12 5v14M5 12h14" />
      </button>
    </div>
  );
}

const FILL_NEXT = { tint: 'solid', solid: 'none', none: 'tint' } as const;
const FILL_LABEL = { tint: 'tint', solid: 'solid', none: 'none' } as const;
const ALIGN_NEXT = { left: 'center', center: 'right', right: 'left' } as const;
const VALIGN_NEXT = { top: 'middle', middle: 'bottom', bottom: 'top' } as const;

function SelectionBar(props: {
  box: Box;
  cam: Camera;
  items: CanvasItem[];
  theme: Theme;
  arrangeOpen: boolean;
  onArrangeToggle: () => void;
  onArrange: (move: LayerMove) => void;
  onRotate?: (degrees: number | 'reset') => void;
  onExportFigure?: (action: { download: ExportFormat } | { copy: CopyFormat }) => void;
  exportOpen?: boolean;
  onExportToggle?: () => void;
  /** Leave room above the selection for the rotate handle. */
  clearance?: number;
  onColor: (color: string | undefined) => void;
  onLine: (patch: Partial<Pick<LineItem, 'startArrow' | 'endArrow' | 'dashed'>>) => void;
  onShape: (patch: Partial<Pick<ShapeItem, 'dashed' | 'fill' | 'align' | 'valign'>>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenFigure?: () => void;
  onAskAi?: () => void;
  onEnter?: () => void;
  onFormatText: (patch: Partial<Pick<TextItem, 'fontSize' | 'bold' | 'align'>>) => void;
  onToFigure?: () => void;
  onComment?: () => void;
}) {
  const { box, cam, items, theme } = props;
  const texts = items.filter((i): i is TextItem => i.type === 'text');
  const text = texts[0];
  const left = cam.x + (box.x + box.w / 2) * cam.k;
  const top = cam.y + box.y * cam.k;
  const gap = 12 + (props.clearance ?? 0);
  const below = top - gap < 52;
  const colorable = items.some((i) => i.type !== 'figure');
  const lines = items.filter((i): i is LineItem => i.type === 'line');
  const shapes = items.filter((i): i is ShapeItem => i.type === 'shape');
  const shape = shapes[0];
  const current = items.find((i) => i.type !== 'figure')?.color;
  return (
    <div className="occ-selbar occ-chrome" style={{ left, top: below ? cam.y + (box.y + box.h) * cam.k + 12 : top - gap, transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }} onPointerDown={(e) => e.stopPropagation()}>
      {props.onOpenFigure && (
        <button type="button" className="occ-bar-btn" onClick={props.onOpenFigure} title="Edit this figure's code">
          <Glyph d="M16 18l6-6-6-6M8 6l-6 6 6 6" /> Code
        </button>
      )}
      {props.onEnter && (
        <button type="button" className="occ-bar-btn" onClick={props.onEnter} title="Work inside the figure: drill down, collapse, flows (Enter)">
          Open
        </button>
      )}
      {props.onAskAi && (
        <button type="button" className="occ-bar-btn" onClick={props.onAskAi} title="Ask the assistant to change this figure">
          <Glyph d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /> Ask AI
        </button>
      )}
      {props.onExportFigure && (
        <span className="occ-menu-anchor">
          <button type="button" className="occ-bar-btn" onClick={props.onExportToggle} aria-expanded={props.exportOpen} title="Export this figure" aria-label="Export this figure">
            <Glyph d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </button>
          {props.exportOpen && (
            <div className="occ-menu" role="menu">
              <div className="occ-menu-label">Download</div>
              {(
                [
                  ['png', 'PNG image'],
                  ['svg', 'SVG vector'],
                  ['pdf', 'PDF document'],
                  ['json', 'Eraser JSON'],
                  ['xml', 'Eraser XML'],
                ] as [ExportFormat, string][]
              ).map(([format, label]) => (
                <button key={format} type="button" role="menuitem" onClick={() => props.onExportFigure!({ download: format })}>
                  {label}
                </button>
              ))}
              <div className="occ-menu-sep" />
              <div className="occ-menu-label">Copy</div>
              {(
                [
                  ['png', 'PNG image'],
                  ['svg', 'SVG vector'],
                  ['json', 'Eraser JSON'],
                ] as [CopyFormat, string][]
              ).map(([format, label]) => (
                <button key={format} type="button" role="menuitem" onClick={() => props.onExportFigure!({ copy: format })}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
      {props.onToFigure && (
        <button type="button" className="occ-bar-btn" onClick={props.onToFigure} title="Turn these boxes and arrows into a diagram figure (with code)">
          <Glyph d="M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4a2 2 0 0 1 2 2V14" /> To diagram
        </button>
      )}
      {text && (
        <span className="occ-bar-group" role="group" aria-label="Text">
          {FONT_SIZES.map(([label, size]) => (
            <button key={label} type="button" className="occ-bar-btn occ-bar-small" aria-pressed={text.fontSize === size} onClick={() => props.onFormatText({ fontSize: size })} title={`Font size ${size}`}>
              {label}
            </button>
          ))}
          <button type="button" className="occ-bar-btn occ-bar-small" aria-pressed={!!text.bold} onClick={() => props.onFormatText({ bold: !text.bold })} title="Bold" style={{ fontWeight: 700 }}>
            B
          </button>
          {(['left', 'center', 'right'] as const).map((align) => (
            <button key={align} type="button" className="occ-bar-btn occ-bar-small" aria-pressed={(text.align ?? 'left') === align} onClick={() => props.onFormatText({ align })} title={`Align ${align}`} aria-label={`Align ${align}`}>
              <Glyph d={align === 'left' ? 'M4 6h16M4 12h10M4 18h13' : align === 'center' ? 'M4 6h16M7 12h10M5.5 18h13' : 'M4 6h16M10 12h10M7 18h13'} />
            </button>
          ))}
        </span>
      )}
      {colorable && (
        <span className="occ-swatches" role="group" aria-label="Color">
          {COLORS.map((c) => {
            const swatch = swatchFor(theme, c);
            return (
              <button
                key={c ?? 'none'}
                type="button"
                className="occ-swatch"
                aria-pressed={current === c}
                aria-label={c ?? 'Default'}
                title={c ?? 'Default'}
                onClick={() => props.onColor(c)}
                style={{ background: swatch?.stroke ?? theme.node.stroke }}
              />
            );
          })}
        </span>
      )}
      {lines.length > 0 && (
        <span className="occ-bar-group">
          <button type="button" className="occ-bar-btn" aria-pressed={lines.every((l) => l.startArrow)} onClick={() => props.onLine({ startArrow: !lines.every((l) => l.startArrow) })} title="Arrow at start">
            <Glyph d="M19 12H5M10 7l-5 5 5 5" />
          </button>
          <button type="button" className="occ-bar-btn" aria-pressed={lines.every((l) => l.endArrow)} onClick={() => props.onLine({ endArrow: !lines.every((l) => l.endArrow) })} title="Arrow at end">
            <Glyph d="M5 12h14M14 7l5 5-5 5" />
          </button>
          <button type="button" className="occ-bar-btn" aria-pressed={lines.every((l) => l.dashed)} onClick={() => props.onLine({ dashed: !lines.every((l) => l.dashed) })} title="Dashed">
            <Glyph d="M4 12h3M10.5 12h3M17 12h3" />
          </button>
        </span>
      )}
      {shape && (
        <span className="occ-bar-group" role="group" aria-label="Shape">
          <button type="button" className="occ-bar-btn" onClick={() => props.onShape({ fill: FILL_NEXT[shape.fill ?? 'tint'] })} title={`Fill: ${FILL_LABEL[shape.fill ?? 'tint']} (click to change)`} aria-label={`Fill: ${FILL_LABEL[shape.fill ?? 'tint']}`}>
            <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
              <rect x={4} y={4} width={16} height={16} rx={3} fill={shape.fill === 'none' ? 'none' : 'currentColor'} fillOpacity={shape.fill === 'solid' ? 1 : 0.25} stroke="currentColor" strokeWidth={2} />
            </svg>
          </button>
          <button type="button" className="occ-bar-btn" aria-pressed={shapes.every((s) => s.dashed)} onClick={() => props.onShape({ dashed: !shapes.every((s) => s.dashed) || undefined })} title="Dashed outline">
            <Glyph d="M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8" />
          </button>
          {shape.text && (
            <>
              <button type="button" className="occ-bar-btn occ-bar-small" onClick={() => props.onShape({ align: ALIGN_NEXT[shape.align ?? 'center'] })} title={`Text ${shape.align ?? 'center'} (click to change)`} aria-label={`Text alignment: ${shape.align ?? 'center'}`}>
                <Glyph d={(shape.align ?? 'center') === 'left' ? 'M4 6h16M4 12h10M4 18h13' : shape.align === 'right' ? 'M4 6h16M10 12h10M7 18h13' : 'M4 6h16M7 12h10M5.5 18h13'} />
              </button>
              <button type="button" className="occ-bar-btn occ-bar-small" onClick={() => props.onShape({ valign: VALIGN_NEXT[shape.valign ?? 'middle'] })} title={`Text ${shape.valign ?? 'middle'} (click to change)`} aria-label={`Vertical text position: ${shape.valign ?? 'middle'}`}>
                <Glyph d={(shape.valign ?? 'middle') === 'top' ? 'M4 4h16M12 8v12M8 12l4-4 4 4' : shape.valign === 'bottom' ? 'M4 20h16M12 4v12M8 12l4 4 4-4' : 'M4 12h16M12 3v5M12 16v5'} />
              </button>
            </>
          )}
        </span>
      )}
      <span className="occ-bar-group occ-menu-anchor">
        <button type="button" className="occ-bar-btn" onClick={props.onArrangeToggle} aria-expanded={props.arrangeOpen} title="Layer order and rotation">
          <Glyph d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /> Arrange
        </button>
        {props.arrangeOpen && (
          <div className="occ-menu" role="menu">
            {(
              [
                ['front', 'Bring to front', '⌘]'],
                ['forward', 'Bring forward', ']'],
                ['backward', 'Send backward', '['],
                ['back', 'Send to back', '⌘['],
              ] as [LayerMove, string, string][]
            ).map(([move, label, keys]) => (
              <button key={move} type="button" role="menuitem" onClick={() => props.onArrange(move)}>
                {label} <kbd>{keys}</kbd>
              </button>
            ))}
            {props.onRotate && (
              <>
                <div className="occ-menu-sep" />
                <button type="button" role="menuitem" onClick={() => props.onRotate!(90)}>
                  Rotate 90° <kbd>⇧R</kbd>
                </button>
                {items.some((i) => i.rotation) && (
                  <button type="button" role="menuitem" onClick={() => props.onRotate!('reset')}>
                    Reset rotation
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </span>
      {props.onComment && (
        <button type="button" className="occ-bar-btn" onClick={props.onComment} title="Comment" aria-label="Comment">
          <Glyph d="M4 5h16v11H9l-5 4z" />
        </button>
      )}
      <button type="button" className="occ-bar-btn" onClick={props.onDuplicate} title="Duplicate (⌘D)" aria-label="Duplicate">
        <Glyph d="M8 8h12v12H8zM4 16V4h12" />
      </button>
      <button type="button" className="occ-bar-btn occ-danger" onClick={props.onDelete} title="Delete (⌫)" aria-label="Delete">
        <Glyph d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
      </button>
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const CSS = `
.occ-root { position: relative; overflow: hidden; outline: none; touch-action: none; user-select: none; -webkit-user-select: none; container: occ / size; }
.occ-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.occ-item { position: absolute; }
.occ-stroke { pointer-events: none; }
.occ-stroke path, .occ-stroke line { pointer-events: visibleStroke; }
.occ-shape-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; box-sizing: border-box; pointer-events: none; }
.occ-text { white-space: pre; }
.occ-line-label { display: table; margin: 0 auto; padding: 1px 4px; border-radius: 3px; white-space: nowrap; }
.occ-figure { border-radius: var(--od-radius-lg); box-shadow: 0 0 0 1px var(--od-color-border); background: var(--od-color-canvas); }
.occ-figure-body { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; }
.occ-figure-tab { position: absolute; left: 0; bottom: 100%; margin-bottom: 4px; font: var(--od-text-ui); font-size: 12px; font-weight: 600; color: var(--od-color-text-muted); white-space: nowrap; opacity: 0; transition: opacity 120ms; pointer-events: none; }
.occ-figure:hover .occ-figure-tab, .occ-figure-selected .occ-figure-tab, .occ-figure-entered .occ-figure-tab { opacity: 1; }
.occ-figure-entered { box-shadow: 0 0 0 2px var(--od-color-accent), var(--od-shadow-chrome); }
.occ-overlay { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.occ-handle { pointer-events: all; }
.occ-handle-nw, .occ-handle-se { cursor: nwse-resize; }
.occ-handle-ne, .occ-handle-sw { cursor: nesw-resize; }
.occ-handle-n, .occ-handle-s { cursor: ns-resize; }
.occ-handle-e, .occ-handle-w { cursor: ew-resize; }
.occ-handle-point { cursor: move; }
.occ-handle-bend { cursor: grab; }
.occ-handle-rotate { cursor: grab; }
.occ-menu-sep { height: 1px; margin: 4px 2px; background: var(--od-color-border); }
.occ-angle { position: absolute; transform-origin: 50% 0; padding: 2px 6px; border-radius: var(--od-radius-sm); background: var(--od-color-text); color: var(--od-color-canvas); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; pointer-events: none; white-space: nowrap; }
.occ-editor { box-sizing: border-box; border: 0; outline: 1.5px solid var(--od-color-accent); border-radius: 2px; background: transparent; resize: none; overflow: hidden; padding: 0; margin: 0; white-space: pre; }
.occ-editor-shape, .occ-editor-line { white-space: pre-wrap; background: color-mix(in srgb, var(--od-color-canvas) 70%, transparent); }
.occ-chrome { font: var(--od-text-ui); color: var(--od-color-text); }
.occ-chrome button { font: inherit; }
.occ-chrome kbd { font: inherit; font-size: 11px; color: var(--od-color-text-subtle); }
.occ-rail { position: absolute; left: var(--od-space-4); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 2px; padding: 4px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); }
.occ-rail-btn { position: relative; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text-muted); cursor: pointer; }
.occ-rail-btn:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.occ-rail-btn[aria-pressed="true"] { background: var(--od-color-accent-soft); color: var(--od-color-accent); }
.occ-rail-key { position: absolute; right: 3px; bottom: 1px; font-size: 8.5px; font-weight: 600; color: var(--od-color-text-subtle); }
.occ-rail-insert { background: var(--od-color-accent); color: var(--od-color-on-accent); }
.occ-rail-insert:hover { background: var(--od-color-accent); color: var(--od-color-on-accent); filter: brightness(1.08); }
.occ-rail-sep { height: 1px; margin: 3px 6px; background: var(--od-color-border); }
.occ-corner { position: absolute; bottom: var(--od-space-4); display: flex; align-items: center; gap: 2px; padding: 3px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); }
.occ-corner:empty { display: none; }
.occ-corner-left { left: var(--od-space-4); }
.occ-corner-right { right: var(--od-space-4); }
.occ-icon-button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text-muted); cursor: pointer; }
.occ-icon-button:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.occ-zoom { min-width: 48px; height: 28px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); font-size: 12px !important; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
.occ-zoom:hover { background: var(--od-color-hover); }
.occ-selbar { position: absolute; display: flex; align-items: center; gap: 2px; padding: 3px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); white-space: nowrap; z-index: 2; }
.occ-bar-btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 7px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); font-size: 12px !important; font-weight: 500; cursor: pointer; }
.occ-bar-btn:hover, .occ-bar-btn[aria-expanded="true"] { background: var(--od-color-hover); }
.occ-bar-btn[aria-pressed="true"] { background: var(--od-color-accent-soft); color: var(--od-color-accent); }
.occ-danger:hover { color: var(--od-color-danger); }
.occ-bar-group { display: inline-flex; gap: 2px; padding-left: 3px; margin-left: 1px; border-left: 1px solid var(--od-color-border); }
.occ-swatches { display: inline-flex; gap: 3px; padding: 0 5px; border-left: 1px solid var(--od-color-border); margin-left: 1px; }
.occ-swatch { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--od-color-raised); box-shadow: 0 0 0 1px var(--od-color-border); padding: 0; cursor: pointer; }
.occ-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--od-color-accent); }
.occ-menu-anchor { position: relative; }
.occ-menu { position: absolute; left: 0; top: calc(100% + 6px); min-width: 180px; padding: 4px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); }
.occ-menu button { display: flex; width: 100%; justify-content: space-between; align-items: center; border: 0; background: none; color: var(--od-color-text); padding: 6px 8px; border-radius: var(--od-radius-sm); cursor: pointer; text-align: left; }
.occ-menu button:hover { background: var(--od-color-hover); }
.occ-entered { position: absolute; top: var(--od-space-4); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 5px 5px 5px 12px; font-size: 12.5px; color: var(--od-color-text-muted); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); }
.occ-button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-md); background: var(--od-color-surface); color: var(--od-color-text); font-weight: 600; cursor: pointer; }
.occ-button:hover { background: var(--od-color-hover); }
.occ-button-primary { border-color: transparent; background: var(--od-color-accent); color: var(--od-color-on-accent); }
.occ-button-primary:hover { background: var(--od-color-accent); filter: brightness(1.08); }
.occ-button-primary kbd { color: inherit; opacity: 0.75; }
.occ-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; pointer-events: none; }
.occ-empty p { margin: 0; font-size: 15px; font-weight: 600; }
.occ-empty span { color: var(--od-color-text-muted); margin-bottom: 6px; }
.occ-empty button { pointer-events: auto; }
.occ-root > .occ-empty:has(.occ-gallery) { max-height: calc(100% - 32px); overflow-y: auto; pointer-events: auto; padding: 8px 4px; }
.occ-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--od-space-3); width: min(820px, calc(100cqw - 120px)); margin: 4px 0 10px; }
.occ-gallery-card { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 8px; text-align: left; font: inherit; color: var(--od-color-text); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); cursor: pointer; transition: border-color var(--od-motion-fast, 120ms), box-shadow var(--od-motion-fast, 120ms); }
.occ-gallery-card:hover, .occ-gallery-card:focus-visible { border-color: var(--od-color-accent); box-shadow: var(--od-shadow-chrome); outline: none; }
.occ-gallery-card img { width: 100%; aspect-ratio: 16 / 10; object-fit: contain; border-radius: var(--od-radius-md); background: var(--od-color-canvas); margin-bottom: 6px; }
.occ-gallery-card strong { font-size: 13px; font-weight: 600; }
.occ-gallery-card small { font-size: 11.5px; color: var(--od-color-text-muted); line-height: 1.35; }
.occ-palette-backdrop { position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: color-mix(in srgb, var(--od-color-canvas) 40%, transparent); z-index: 5; font: var(--od-text-ui); color: var(--od-color-text); }
.occ-palette { width: min(520px, calc(100% - 32px)); max-height: 64vh; display: flex; flex-direction: column; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-xl); box-shadow: var(--od-shadow-chrome), 0 24px 48px -12px rgba(0,0,0,0.25); overflow: hidden; }
.occ-palette-input { border: 0; border-bottom: 1px solid var(--od-color-border); outline: none; padding: 14px 16px; font: inherit; font-size: 15px; background: none; color: var(--od-color-text); }
.occ-palette-input::placeholder { color: var(--od-color-text-subtle); }
.occ-palette-list { overflow-y: auto; padding: 6px; }
.occ-palette-empty { margin: 12px; color: var(--od-color-text-muted); }
.occ-palette-section + .occ-palette-section { margin-top: 6px; }
.occ-palette-label { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--od-color-text-subtle); }
.occ-palette-row { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 10px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text); font: inherit; text-align: left; cursor: pointer; }
.occ-palette-hint { color: var(--od-color-text-muted); font-size: 12px; }
.occ-palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 2px; padding: 0 4px; }
.occ-palette-icon { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 0; border-radius: var(--od-radius-md); background: none; color: var(--od-color-text-muted); font: inherit; font-size: 10.5px; cursor: pointer; overflow: hidden; }
.occ-palette-icon span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.occ-palette-row[aria-selected="true"], .occ-palette-icon[aria-selected="true"] { background: var(--od-color-hover); color: var(--od-color-text); }
.occ-sticky { box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 14px; text-align: center; white-space: pre-wrap; overflow-wrap: anywhere; overflow: hidden; border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 6px 14px -6px rgba(0,0,0,0.22); }
.occ-code { box-sizing: border-box; padding: 14px; background: var(--od-color-surface); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); color: var(--od-color-text); overflow: hidden; }
.occ-code pre { margin: 0; font: inherit; white-space: pre; }
.occ-code-lang { position: absolute; top: 6px; right: 10px; font: var(--od-text-ui); font-size: 10.5px; color: var(--od-color-text-subtle); }
.occ-frame { pointer-events: none; }
.occ-frame * { pointer-events: visiblePainted; }
.occ-editor-sticky, .occ-editor-code { white-space: pre-wrap; background: transparent; outline-offset: 4px; }
.occ-editor-code { white-space: pre; }
.occ-bar-small { padding: 0 6px; min-width: 24px; justify-content: center; }
.occ-corner-sep { width: 1px; align-self: stretch; margin: 3px 2px; background: var(--od-color-border); }
.occ-menu-up { top: auto; bottom: calc(100% + 8px); left: auto; right: 0; }
.occ-menu-label { padding: 6px 8px 2px; font-size: 11px; font-weight: 600; color: var(--od-color-text-subtle); text-transform: uppercase; letter-spacing: 0.04em; }
.occ-comments { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.occ-comments > * { pointer-events: auto; }
.occ-pin { position: absolute; transform: translate(-4px, -100%); display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border: 2px solid var(--od-color-raised); border-radius: 13px 13px 13px 3px; background: var(--od-color-accent); color: var(--od-color-on-accent); font-size: 10.5px !important; font-weight: 700; box-shadow: var(--od-shadow-chrome); cursor: pointer; }
.occ-pin[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--od-color-accent), var(--od-shadow-chrome); }
.occ-pin-resolved { background: var(--od-color-text-subtle); }
.occ-pin-draft { background: var(--od-color-accent); opacity: 0.7; min-width: 26px; }
.occ-pin-count { position: absolute; top: -6px; right: -8px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--od-color-text); color: var(--od-color-canvas); font-size: 9px; line-height: 14px; }
.occ-thread { position: absolute; width: 280px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome), 0 16px 32px -12px rgba(0,0,0,0.25); z-index: 3; }
.occ-thread-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--od-color-text-muted); }
.occ-thread-actions { display: flex; gap: 2px; }
.occ-thread-actions button { border: 0; background: none; color: var(--od-color-text-muted); font-size: 12px !important; padding: 2px 6px; border-radius: var(--od-radius-sm); cursor: pointer; }
.occ-thread-actions button:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.occ-thread-messages { display: flex; flex-direction: column; gap: 10px; max-height: 260px; overflow-y: auto; }
.occ-message p { margin: 4px 0 0 28px; white-space: pre-wrap; font-size: 13px; }
.occ-message-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--od-color-text-subtle); }
.occ-message-meta strong { color: var(--od-color-text); font-weight: 600; }
.occ-avatar { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--od-color-accent-soft); color: var(--od-color-accent); font-size: 9.5px; font-weight: 700; }
.occ-thread textarea { box-sizing: border-box; width: 100%; resize: none; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); padding: 7px 8px; font: inherit; font-size: 13px; background: var(--od-color-surface); color: var(--od-color-text); outline: none; }
.occ-thread textarea:focus { border-color: var(--od-color-accent); }
.occ-thread-foot { display: flex; justify-content: flex-end; gap: 6px; }
.occ-thread-foot button:disabled { opacity: 0.45; cursor: default; }
.occ-rail { max-height: calc(100% - 32px); overflow-y: auto; scrollbar-width: none; }
/* Small containers (phones, narrow host panes): tools along the bottom, the selection bar wraps at the top. */
@container occ (max-width: 640px) {
  .occ-rail { left: 50%; top: auto; bottom: 64px; transform: translateX(-50%); flex-direction: row; max-width: calc(100% - 24px); max-height: none; overflow-x: auto; overflow-y: hidden; }
  .occ-rail-key { display: none; }
  .occ-rail-sep { width: 1px; height: auto; margin: 6px 3px; }
  .occ-rail-btn { flex: none; width: 40px; height: 40px; }
  .occ-selbar { left: 50% !important; top: 8px !important; transform: translateX(-50%) !important; flex-wrap: wrap; justify-content: center; max-width: calc(100% - 16px); width: max-content; white-space: normal; }
  .occ-selbar .occ-menu-anchor { position: static; }
  .occ-selbar .occ-menu { left: 0; right: 0; min-width: 0; }
  .occ-rail-btn { width: 36px; height: 38px; }
  .occ-corner { bottom: 12px; }
  .occ-corner-left { left: 12px; }
  .occ-corner-right { right: 12px; }
  .occ-corner-right .occ-bar-btn { font-size: 0; gap: 0; }
  .occ-empty { top: 12px; transform: translateX(-50%); max-height: calc(100% - 140px); overflow-y: auto; pointer-events: auto; padding: 0 12px; }
  .occ-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); width: calc(100cqw - 24px); gap: 8px; }
  .occ-gallery-card small { display: none; }
  .occ-entered { top: auto; bottom: 10px; left: 8px; transform: none; z-index: 3; padding: 3px; }
  .occ-entered kbd { display: none; }
  .occ-entered-hint { display: none; }
  .occ-thread { width: min(280px, calc(100cqw - 32px)); }
  .occ-palette-backdrop { padding-top: 8px; }
}
@container occ (max-height: 520px) {
  .occ-empty { top: 12px; transform: translateX(-50%); }
}
.occ-peers { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.occ-peer-cursor { position: absolute; left: 0; top: 0; transition: transform 80ms linear; will-change: transform; }
.occ-peer-cursor svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); }
.occ-peer-cursor span, .occ-peer-tag { display: inline-block; padding: 1px 6px; border-radius: var(--od-radius-sm); color: #fff; font-size: 11px; font-weight: 600; line-height: 16px; white-space: nowrap; }
.occ-peer-cursor span { position: absolute; left: 14px; top: 14px; }
.occ-peer-tag { position: absolute; transform: translateY(calc(-100% - 6px)); opacity: 0.92; }
@media (prefers-reduced-motion: reduce) { .occ-peer-cursor { transition: none; } }
.occ-focus { position: absolute; inset: 0; z-index: 2; background: var(--od-color-canvas); }
.occ-world-glide { transition: transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1); }
.occ-root:fullscreen { width: 100vw !important; height: 100vh !important; }
.occ-present-bar { position: absolute; left: 50%; bottom: var(--od-space-4); transform: translateX(-50%); z-index: 4; display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 4px; max-width: calc(100% - 24px); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); transition: opacity 300ms ease, transform 300ms ease; }
.occ-present-bar-hidden { opacity: 0; transform: translate(-50%, 8px); pointer-events: none; }
.occ-present-count { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--od-color-text-muted); padding: 0 4px; }
.occ-present-title { font-size: 13px; font-weight: 600; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 6px; }
@media (prefers-reduced-motion: reduce) { .occ-world-glide { transition: none; } }
.occ-present-notes { position: absolute; left: var(--od-space-4); bottom: 72px; z-index: 4; max-width: min(420px, calc(100% - 32px)); max-height: 40%; overflow-y: auto; padding: 10px 12px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
.occ-muted { color: var(--od-color-text-muted); font-size: 12.5px; }
.occ-laser { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; overflow: visible; }
.occ-slides { position: absolute; top: var(--od-space-4); right: var(--od-space-4); bottom: 64px; z-index: 3; width: min(300px, calc(100% - 32px)); display: flex; flex-direction: column; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); font-size: 13px; }
.occ-slides-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 12px; border-bottom: 1px solid var(--od-color-border); font-weight: 600; }
.occ-slides-actions { display: flex; align-items: center; gap: 4px; }
.occ-slides-list { list-style: none; margin: 0; padding: 4px; overflow-y: auto; flex: 1; }
.occ-slide { border-radius: var(--od-radius-md); }
.occ-slide:hover { background: var(--od-color-hover); }
.occ-slide-dragging { opacity: 0.4; }
.occ-slide-hidden .occ-slide-title { color: var(--od-color-text-subtle); text-decoration: line-through; }
.occ-slide-row { display: flex; align-items: center; gap: 4px; padding: 2px 4px; }
.occ-slide-num { width: 18px; text-align: right; font-size: 11.5px; color: var(--od-color-text-subtle); font-variant-numeric: tabular-nums; }
.occ-slide-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 6px 4px; border: 0; background: none; color: var(--od-color-text); font: inherit; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.occ-slide-has-notes { width: 6px; height: 6px; border-radius: 50%; background: var(--od-color-accent); flex: none; }
.occ-slide-tools { display: flex; opacity: 0.55; }
.occ-slide:hover .occ-slide-tools, .occ-slide:focus-within .occ-slide-tools { opacity: 1; }
.occ-slide-tools .occ-icon-button { width: 24px; height: 24px; }
.occ-slide-notes { display: block; width: calc(100% - 16px); margin: 0 8px 8px; padding: 6px 8px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); background: var(--od-color-surface); color: var(--od-color-text); font: inherit; font-size: 12.5px; resize: vertical; }
.occ-peer-laser { width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.25); }
.occ-mention { color: var(--od-color-accent); font-weight: 600; background: var(--od-color-accent-soft); border-radius: 3px; padding: 0 2px; }
.occ-mention-picker { display: flex; flex-direction: column; gap: 1px; padding: 4px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-md); background: var(--od-color-raised); }
.occ-mention-picker button { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border: 0; border-radius: var(--od-radius-sm); background: none; color: var(--od-color-text); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.occ-mention-picker button[aria-selected="true"], .occ-mention-picker button:hover { background: var(--od-color-hover); }
.occ-figure-parked { border: 1px dashed var(--od-color-border); border-radius: 8px; background: var(--od-color-canvas); }
`;
