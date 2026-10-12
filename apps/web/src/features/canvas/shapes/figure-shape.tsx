/**
 * A figure: a titled frame that groups shapes on the canvas (ported from
 * OctoFocus's eraser-style figure group). Children are tldraw-parented to
 * it, so moving the figure moves everything inside; it can't be resized
 * smaller than its contents. Each figure is exported as a PNG that notes
 * embed (see sync-figures.ts) — `meta.figureId` is its id in the API.
 *
 * On screen it follows light/dark mode; exported images (toSvg) are always
 * light so an embedded figure looks the same in every note.
 */
import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  type Editor,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";
import { useEffect, useRef, useState } from "react";
import { FIGURE_DROP_EVENT } from "../constants";

export type FigureShape = TLBaseShape<
  "figure",
  { w: number; h: number; label: string }
>;

export const FIGURE_TYPE = "figure";
export const FIGURE_TITLE_HEIGHT = 32;
const CHILD_PADDING = 16;

// tldraw's ShapeUtil generic is closed over its built-in shape union.
// @ts-expect-error — custom shape type not in TLShape union
export class FigureShapeUtil extends ShapeUtil<FigureShape> {
  static override type = FIGURE_TYPE;
  static override props = { w: T.number, h: T.number, label: T.string };

  override getDefaultProps(): FigureShape["props"] {
    return { w: 320, h: 200, label: "Figure" };
  }

  override canResize = () => true;
  // Renaming is handled by the title bar itself (see FigureComponent).
  override canEdit = () => false;
  override hideRotateHandle = () => true;

  override getGeometry(shape: FigureShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override getIndicatorPath() {
    // Must exist as a function; undefined falls back to indicator() below.
    return undefined;
  }

  // @ts-expect-error — same TLShape narrowing as the class
  override onResize(shape: FigureShape, info: TLResizeInfo<FigureShape>) {
    const next = resizeBox(
      shape as never,
      info as never,
    ) as unknown as FigureShape;
    // Never smaller than what's inside (plus padding).
    let maxRight = 0;
    let maxBottom = FIGURE_TITLE_HEIGHT;
    for (const id of this.editor.getSortedChildIdsForParent(shape.id)) {
      const child = this.editor.getShape(id);
      if (!child) continue;
      const b = this.editor.getShapeGeometry(child).bounds;
      maxRight = Math.max(maxRight, child.x + b.maxX);
      maxBottom = Math.max(maxBottom, child.y + b.maxY);
    }
    next.props.w = Math.max(next.props.w, maxRight + CHILD_PADDING);
    next.props.h = Math.max(next.props.h, maxBottom + CHILD_PADDING);
    return next;
  }

  override component(shape: FigureShape) {
    return <FigureComponent shape={shape} util={this} />;
  }

  override indicator(shape: FigureShape) {
    return (
      <rect width={shape.props.w} height={shape.props.h} rx={10} ry={10} />
    );
  }

  /** Export: always light, with the title bar, so embeds look consistent. */
  override toSvg(shape: FigureShape) {
    const { w, h, label } = shape.props;
    return (
      <g>
        <rect
          width={w}
          height={h}
          rx={10}
          ry={10}
          fill="#ffffff"
          stroke="#e3e2de"
          strokeWidth={1}
        />
        <path
          d={`M0 10 a10 10 0 0 1 10 -10 h${w - 20} a10 10 0 0 1 10 10 v${FIGURE_TITLE_HEIGHT - 10} h${-w} z`}
          fill="#f7f7f5"
        />
        <line
          x1={0}
          y1={FIGURE_TITLE_HEIGHT}
          x2={w}
          y2={FIGURE_TITLE_HEIGHT}
          stroke="#e3e2de"
        />
        <text
          x={12}
          y={FIGURE_TITLE_HEIGHT / 2 + 4}
          fontSize={12}
          fontWeight={600}
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fill="#191919"
        >
          {label}
        </text>
      </g>
    );
  }
}

function FigureComponent({
  shape,
  util,
}: {
  shape: FigureShape;
  util: FigureShapeUtil;
}) {
  const { w, h, label } = shape.props;
  const figureId = (shape.meta as { figureId?: string } | undefined)?.figureId;
  const editor = (util as unknown as { editor: Editor }).editor;
  // Our own rename state: after a double-click tldraw keeps keyboard focus on
  // the canvas, so its built-in editing mode never let you type a title.
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPress = useRef<{ t: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!renaming) return;
    // Wait for tldraw's own pointer-up handling, which refocuses the canvas.
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, [renaming]);

  function rename(next: string) {
    editor.updateShape({
      id: shape.id,
      type: FIGURE_TYPE,
      props: { label: next.trim() || "Figure" },
    } as never);
  }

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: w,
        height: h,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        pointerEvents: "all",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-family-sans)",
      }}
    >
      <div
        // Double-click the title bar to rename. Detected from two quick
        // presses: tldraw cancels the canvas's mouse events, so the browser
        // never fires a dblclick here. The first press still selects/moves.
        onPointerDownCapture={(e) => {
          if (renaming || editor.getInstanceState().isReadonly) return;
          const now = e.timeStamp;
          const last = lastPress.current;
          lastPress.current = { t: now, x: e.clientX, y: e.clientY };
          if (
            last &&
            now - last.t < 400 &&
            Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6
          ) {
            e.stopPropagation();
            e.preventDefault();
            lastPress.current = null;
            setRenaming(true);
          }
        }}
        style={{
          height: FIGURE_TITLE_HEIGHT,
          flex: "0 0 auto",
          background: "var(--muted)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 6px 0 10px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--foreground-strong)",
        }}
      >
        {renaming ? (
          <input
            ref={inputRef}
            defaultValue={label}
            maxLength={120}
            aria-label="Figure title"
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              if (e.currentTarget.dataset.cancelled !== "true")
                rename(e.currentTarget.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.dataset.cancelled = "true";
                e.currentTarget.blur();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              font: "inherit",
              color: "inherit",
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 4px",
              outline: "none",
            }}
          />
        ) : (
          <span
            title="Double-click to rename"
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        )}
        <span
          role="button"
          aria-label="Drag into a note to embed this figure"
          title={
            figureId
              ? "Drag into a note to embed this figure"
              : "Saving the figure… you can drag it in a moment"
          }
          // Our own pointer drag rather than HTML drag-and-drop: tldraw owns
          // pointer events on the canvas, so native drags don't start reliably.
          onPointerDownCapture={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (figureId) startFigureDrag(e.nativeEvent, figureId, label);
          }}
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 4,
            cursor: figureId ? "grab" : "wait",
            color: "var(--muted-foreground)",
            opacity: figureId ? 1 : 0.5,
            touchAction: "none",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden
          >
            {[5, 12, 19].flatMap((y) =>
              [9, 15].map((x) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />
              )),
            )}
          </svg>
        </span>
      </div>
    </HTMLContainer>
  );
}

/**
 * Drags a figure out of the canvas: a small chip follows the pointer, and
 * releasing over a note (an element with `data-figure-drop-zone`) fires
 * FIGURE_DROP_EVENT there with the figure id and drop point.
 */
function startFigureDrag(down: PointerEvent, figureId: string, label: string) {
  const chip = document.createElement("div");
  chip.textContent = `⧉ ${label || "Figure"}`;
  Object.assign(chip.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "9999",
    pointerEvents: "none",
    padding: "6px 10px",
    borderRadius: "8px",
    background: "var(--foreground-strong)",
    color: "var(--background)",
    font: "600 12px var(--font-family-sans)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    transform: `translate(${down.clientX + 12}px, ${down.clientY + 12}px)`,
  });
  document.body.appendChild(chip);
  document.body.style.cursor = "grabbing";
  let zone: Element | null = null;

  const highlight = (next: Element | null) => {
    if (next === zone) return;
    zone?.removeAttribute("data-figure-drop-active");
    next?.setAttribute("data-figure-drop-active", "true");
    zone = next;
  };
  const zoneAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest("[data-figure-drop-zone]") ?? null;

  const move = (ev: PointerEvent) => {
    chip.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
    highlight(zoneAt(ev.clientX, ev.clientY));
  };
  const end = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    chip.remove();
    document.body.style.cursor = "";
    const target =
      ev.type === "pointerup" ? zoneAt(ev.clientX, ev.clientY) : null;
    highlight(null);
    target?.dispatchEvent(
      new CustomEvent(FIGURE_DROP_EVENT, {
        detail: { figureId, x: ev.clientX, y: ev.clientY },
      }),
    );
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

/** Register with every <Tldraw> that may contain figures (editor and read-only views). */
export const SHAPE_UTILS = [FigureShapeUtil] as never[];
