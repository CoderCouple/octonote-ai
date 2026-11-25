"use client";

import {
  boundsOf,
  boxesIntersect,
  boxFromPoints,
  centerOf,
  HANDLES,
  normalizeAngle,
  resizeBox,
  resizeCursor,
  resizeRotatedBox,
  rotatedBounds,
  SLIDE_SIZE,
  SlideStage,
  SlideView,
  snapBox,
  withGroups,
  type Box,
  type DeckDocument,
  type DeckSlide,
  type Handle,
  type Point,
  type SlideElement,
  type SlideRenderers,
  type SnapResult,
} from "@octonote/slides";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Screen pixels: how close counts as lined up, and how far a press moves before it's a drag. */
const SNAP_PX = 6;
const DRAG_PX = 3;

type Gesture =
  | { kind: "move"; start: Point; ids: string[]; origin: Map<string, Box>; moved: boolean }
  | { kind: "resize"; start: Point; handle: Handle; ids: string[]; origin: Map<string, Box & { rotate?: number }>; frame: Box; single: boolean; keepRatio: boolean }
  | { kind: "rotate"; id: string; center: Point; startAngle: number; origin: number }
  | { kind: "marquee"; start: Point; current: Point; additive: boolean; before: string[] };

export interface EditorStageProps {
  deck: DeckDocument;
  slide: DeckSlide;
  selection: string[];
  onSelect: (ids: string[]) => void;
  /** The object being edited in place (its text, or using its block), if any. */
  editing: string | null;
  onEditing: (id: string | null) => void;
  /** A finished change (one undo step); `live` changes during a drag aren't recorded. */
  onChange: (next: DeckSlide) => void;
  renderers: SlideRenderers;
  /** What an object shows while it's being edited (an editable text box). */
  renderEditing: (element: SlideElement) => ReactNode;
  /** Animation preview: plays the slide's clicks in place. */
  previewStep?: number;
}

const angleOf = (p: Point, c: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;

/**
 * The slide being edited: objects you select, move, resize and rotate with
 * snap guides, a marquee for several, double-click to edit an object's text
 * or use its block. Everything is measured in slide units (960 × 540) on the
 * scaled stage, so handles and snapping feel the same at any zoom.
 */
export function EditorStage({ deck, slide, selection, onSelect, editing, onEditing, onChange, renderers, renderEditing, previewStep }: EditorStageProps) {
  const size = SLIDE_SIZE[deck.aspect];
  const host = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DeckSlide | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [guides, setGuides] = useState<SnapResult["guides"]>({});
  const shown = draft ?? slide;
  const selected = useMemo(() => new Set(selection), [selection]);

  // The draft only lives during a gesture; a new slide (or undo) drops it.
  useEffect(() => setDraft(null), [slide]);

  /** Slide units per screen pixel, and the slide's corner on screen. */
  const frame = () => {
    const el = host.current?.querySelector<HTMLElement>(".osl-slide");
    const rect = el?.getBoundingClientRect();
    return { rect, scale: rect && rect.width ? rect.width / size.w : 1 };
  };
  const toSlide = (clientX: number, clientY: number): Point => {
    const { rect, scale } = frame();
    return rect ? { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale } : { x: 0, y: 0 };
  };
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setScale(frame().scale);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w]);

  const elementAt = (target: EventTarget | null) => {
    const node = (target as Element | null)?.closest?.("[data-osl-el]");
    const id = node?.getAttribute("data-osl-el");
    return id ? shown.elements.find((e) => e.id === id) : undefined;
  };

  /** Edges and centres to snap to: the slide and every object not being moved. */
  const snapTargets = (moving: Set<string>): Box[] => [
    { x: 0, y: 0, w: size.w, h: size.h },
    ...shown.elements.filter((e) => !moving.has(e.id)).map((e) => (e.rotate ? rotatedBounds(e, e.rotate) : e)),
  ];

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || previewStep !== undefined) return;
    const p = toSlide(event.clientX, event.clientY);
    const handle = (event.target as Element).closest?.("[data-handle]")?.getAttribute("data-handle");
    if (handle === "rotate") {
      const el = shown.elements.find((e) => e.id === selection[0]);
      if (!el || el.lock) return;
      const c = centerOf(el);
      setGesture({ kind: "rotate", id: el.id, center: c, startAngle: angleOf(p, c), origin: el.rotate ?? 0 });
    } else if (handle) {
      const ids = selection.filter((id) => !shown.elements.find((e) => e.id === id)?.lock);
      if (!ids.length) return;
      const picked = shown.elements.filter((e) => ids.includes(e.id));
      const single = picked.length === 1;
      setGesture({
        kind: "resize",
        start: p,
        handle: handle as Handle,
        ids,
        origin: new Map(picked.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h, rotate: e.rotate }])),
        frame: single ? { x: picked[0]!.x, y: picked[0]!.y, w: picked[0]!.w, h: picked[0]!.h } : boundsOf(picked)!,
        single,
        // Pictures keep their shape; Shift keeps any object's.
        keepRatio: event.shiftKey || (single && picked[0]!.kind === "image"),
      });
    } else {
      const el = elementAt(event.target);
      if (el && el.id === editing) return; // clicks inside the object being edited are the editor's
      if (editing) onEditing(null);
      if (el) {
        const group = withGroups(shown, [el.id]);
        let next = selection;
        if (event.shiftKey) next = selected.has(el.id) ? selection.filter((id) => !group.includes(id)) : [...new Set([...selection, ...group])];
        else if (!selected.has(el.id)) next = group;
        onSelect(next);
        const movable = next.filter((id) => !shown.elements.find((e) => e.id === id)?.lock);
        setGesture({ kind: "move", start: p, ids: movable, origin: new Map(shown.elements.filter((e) => movable.includes(e.id)).map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }])), moved: false });
      } else {
        setGesture({ kind: "marquee", start: p, current: p, additive: event.shiftKey, before: event.shiftKey ? selection : [] });
        if (!event.shiftKey) onSelect([]);
      }
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const p = toSlide(event.clientX, event.clientY);
    const threshold = SNAP_PX / scale;
    if (gesture.kind === "move") {
      let dx = p.x - gesture.start.x;
      let dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) * scale < DRAG_PX) return;
      if (!gesture.moved) setGesture({ ...gesture, moved: true });
      if (event.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0); // straight lines only
      const moving = new Set(gesture.ids);
      const bounds = boundsOf([...gesture.origin.values()].map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })));
      let snap: SnapResult = { dx: 0, dy: 0, guides: {} };
      if (bounds && !event.altKey) snap = snapBox(bounds, snapTargets(moving), threshold);
      setGuides(snap.guides);
      setDraft({
        ...slide,
        elements: slide.elements.map((e) => {
          const o = gesture.origin.get(e.id);
          return o ? { ...e, x: Math.round(o.x + dx + snap.dx), y: Math.round(o.y + dy + snap.dy) } : e;
        }),
      });
    } else if (gesture.kind === "resize") {
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      const keep = gesture.keepRatio || event.shiftKey;
      if (gesture.single) {
        const id = gesture.ids[0]!;
        const o = gesture.origin.get(id)!;
        let box = o.rotate ? resizeRotatedBox(o, o.rotate, gesture.handle, dx, dy, keep, 12) : resizeBox(o, gesture.handle, dx, dy, keep, 12);
        // Snap the edges being dragged (not for turned objects).
        if (!o.rotate && !event.altKey && !keep) {
          const h = gesture.handle;
          const snap = snapBox(box, snapTargets(new Set([id])), threshold, { x: h.includes("e") || h.includes("w"), y: h.includes("n") || h.includes("s") });
          if (h.includes("e")) box = { ...box, w: box.w + snap.dx };
          if (h.includes("w")) box = { ...box, x: box.x + snap.dx, w: box.w - snap.dx };
          if (h.includes("s")) box = { ...box, h: box.h + snap.dy };
          if (h.includes("n")) box = { ...box, y: box.y + snap.dy, h: box.h - snap.dy };
          setGuides(snap.guides);
        }
        setDraft({ ...slide, elements: slide.elements.map((e) => (e.id === id ? { ...e, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) } : e)) });
      } else {
        // A group scales from its bounds, each object keeping its place within it.
        const to = resizeBox(gesture.frame, gesture.handle, dx, dy, keep, 12);
        const sx = to.w / Math.max(1, gesture.frame.w);
        const sy = to.h / Math.max(1, gesture.frame.h);
        setDraft({
          ...slide,
          elements: slide.elements.map((e) => {
            const o = gesture.origin.get(e.id);
            if (!o) return e;
            return { ...e, x: Math.round(to.x + (o.x - gesture.frame.x) * sx), y: Math.round(to.y + (o.y - gesture.frame.y) * sy), w: Math.max(12, Math.round(o.w * sx)), h: Math.max(12, Math.round(o.h * sy)) };
          }),
        });
      }
    } else if (gesture.kind === "rotate") {
      let angle = normalizeAngle(gesture.origin + angleOf(p, gesture.center) - gesture.startAngle);
      // Shift: 15° steps. Otherwise it settles on square angles when close.
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      else for (const square of [0, 90, 180, 270, 360]) if (Math.abs(angle - square) < 4) angle = square % 360;
      setDraft({ ...slide, elements: slide.elements.map((e) => (e.id === gesture.id ? { ...e, rotate: Math.round(angle) || undefined } : e)) });
    } else if (gesture.kind === "marquee") {
      setGesture({ ...gesture, current: p });
      const area = boxFromPoints(gesture.start, p);
      const hit = shown.elements.filter((e) => !e.lock && boxesIntersect(area, e.rotate ? rotatedBounds(e, e.rotate) : e)).map((e) => e.id);
      onSelect([...new Set([...gesture.before, ...withGroups(shown, hit)])]);
    }
  };

  const onPointerUp = () => {
    if (draft && gesture && gesture.kind !== "marquee") onChange(draft);
    setGesture(null);
    setGuides({});
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    // A press captures the pointer (for dragging), which retargets the double-click
    // to the stage: find the object under the pointer instead.
    const under = host.current?.ownerDocument.elementFromPoint(event.clientX, event.clientY) ?? event.target;
    const el = elementAt(under);
    if (!el || el.lock) return;
    if (el.kind === "text" || el.kind === "block") {
      onSelect([el.id]);
      onEditing(el.id);
    }
  };

  // What's selected, drawn over the slide in slide units.
  const picked = shown.elements.filter((e) => selected.has(e.id));
  const k = 1 / scale; // one screen pixel, in slide units
  const handleSize = 9 * k;
  const overlay = (
    <div className="oxd-overlay" aria-hidden="true">
      {picked.map((e) => (
        <div
          key={e.id}
          className={`oxd-sel${e.lock ? " oxd-sel-locked" : ""}`}
          style={{ left: e.x, top: e.y, width: e.w, height: e.h, transform: e.rotate ? `rotate(${e.rotate}deg)` : undefined, borderWidth: 1.5 * k }}
        >
          {picked.length === 1 && !e.lock && e.id !== editing ? (
            <>
              {HANDLES.map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  className={`oxd-handle oxd-handle-${h}`}
                  style={{ width: handleSize, height: handleSize, borderWidth: 1.5 * k, cursor: resizeCursor(h, e.rotate ?? 0) }}
                />
              ))}
              {e.kind !== "shape" || e.shape !== "line" ? (
                <span data-handle="rotate" className="oxd-rotate" style={{ width: handleSize * 1.3, height: handleSize * 1.3, top: -28 * k, borderWidth: 1.5 * k }} />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
      {picked.length > 1
        ? (() => {
            const b = boundsOf(picked.filter((e) => !e.lock))!;
            return b ? (
              <div className="oxd-sel oxd-sel-group" style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderWidth: 1.5 * k }}>
                {HANDLES.map((h) => (
                  <span key={h} data-handle={h} className={`oxd-handle oxd-handle-${h}`} style={{ width: handleSize, height: handleSize, borderWidth: 1.5 * k, cursor: resizeCursor(h) }} />
                ))}
              </div>
            ) : null;
          })()
        : null}
      {guides.x ? <div className="oxd-guide" style={{ left: guides.x.at, top: guides.x.from, width: k, height: guides.x.to - guides.x.from }} /> : null}
      {guides.y ? <div className="oxd-guide" style={{ top: guides.y.at, left: guides.y.from, height: k, width: guides.y.to - guides.y.from }} /> : null}
      {gesture?.kind === "marquee" ? (() => {
        const m = boxFromPoints(gesture.start, gesture.current);
        return <div className="oxd-marquee" style={{ left: m.x, top: m.y, width: m.w, height: m.h, borderWidth: k }} />;
      })() : null}
    </div>
  );

  return (
    <div
      ref={host}
      className={`oxd-stage h-full w-full${gesture?.kind === "move" && gesture.moved ? " oxd-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <SlideStage aspect={deck.aspect} fit="contain">
        <SlideView
          deck={deck}
          slide={shown}
          {...renderers}
          step={previewStep}
          animate={previewStep !== undefined}
          renderElement={(el, content) =>
            el.id === editing ? (
              <div className="oxd-live">{renderEditing(el)}</div>
            ) : (
              // Until it's being edited, an object's content doesn't take clicks: they select and move it.
              <div className="oxd-inert">{content}</div>
            )
          }
        >
          {previewStep === undefined ? overlay : null}
        </SlideView>
      </SlideStage>
    </div>
  );
}
