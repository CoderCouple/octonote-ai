import { useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import type { NoteBlock } from "../blocks.js";
import type { DeckDocument, DeckSlide, ElementStyle, ShapeName, SlideElement } from "../model.js";
import { timelineCss } from "../timeline.js";
import { observeSize } from "./stage.js";

/** Where blocks are drawn: a live slide, or a small non-interactive picture of one (presenter view, thumbnails). */
export type SlideMode = "live" | "preview";

export interface SlideRenderers {
  /**
   * Draws an object's note blocks. The host app owns the block renderer (its
   * editor schema), so slides can hold anything a note can. For paragraph
   * animations each drawn block must carry its id in `data-id` (BlockNote does).
   */
  renderBlocks: (blocks: NoteBlock[], ctx: { slide: DeckSlide; element: SlideElement; mode: SlideMode }) => ReactNode;
  /** Draws a canvas object, zoomed to one of its frames or figures. */
  renderCanvas?: (canvas: { canvasId: string; itemId: string | null }, ctx: { slide: DeckSlide; element: SlideElement; mode: SlideMode }) => ReactNode;
  /**
   * The CSS selector for one paragraph inside a text box, given
   * `[data-id="…"]`, when the id alone matches more than one element
   * (BlockNote marks a block's outer and inner element alike).
   */
  blockSelector?: (attributeMatch: string) => string;
}

export interface SlideViewProps extends SlideRenderers {
  deck: Pick<DeckDocument, "theme">;
  slide: DeckSlide;
  /** How many clicks have played; omit to show everything (editing, thumbnails). */
  step?: number;
  /** Play the current step's animations (moving forward); off going back. Default true. */
  animate?: boolean;
  mode?: SlideMode;
  /** Shared by objects on both slides of a `morph` transition. */
  morphNames?: Map<string, string>;
  /** Shrink content that doesn't fit its box. On by default. */
  fit?: boolean;
  /**
   * Lets the editor wrap or replace what an object draws (an editable text
   * box, a selection target). Gets the object and what the slide would draw.
   */
  renderElement?: (element: SlideElement, content: ReactNode) => ReactNode;
  /** Extra layers over the objects (the editor's selection handles and guides). */
  children?: ReactNode;
}

/** Theme tokens objects can use for colours; anything else is used as a CSS colour. */
const TOKENS = new Set(["bg", "fg", "muted", "accent", "surface", "line"]);
export const paint = (value: string | undefined) => (value === undefined ? undefined : TOKENS.has(value) ? `var(--osl-${value})` : value);

/**
 * Content that scales down (never up) to fit its box. Uses a transform, not
 * CSS zoom: editors' menus and carets position correctly under transforms.
 * The content is laid out wider by the same factor first, so text wraps
 * across the full width.
 */
export function FitBox({ fit, className, style, children }: { fit: boolean; className?: string; style?: CSSProperties; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const reset = () => {
      content.style.transform = "";
      content.style.width = "";
    };
    if (!fit) {
      reset();
      return;
    }
    // The box's own window: it may be the presenter view's.
    const win = box.ownerDocument.defaultView ?? window;
    const extent = () => {
      let height = content.scrollHeight;
      let width = content.scrollWidth;
      for (const child of content.children) {
        height = Math.max(height, (child as HTMLElement).offsetTop - content.offsetTop + child.scrollHeight);
        width = Math.max(width, child.scrollWidth);
      }
      return { height, width };
    };
    let frame = 0;
    let fitting = false;
    const measure = () => {
      if (fitting) return;
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => {
        fitting = true;
        reset();
        const W = box.clientWidth;
        const H = box.clientHeight;
        let { height, width } = extent();
        let scale = Math.min(1, H / Math.max(1, height), W / Math.max(1, width));
        // Laid out wider, text re-wraps and the height changes: settle in a few steps.
        for (let i = 0; i < 4 && scale < 0.98; i++) {
          content.style.width = `${W / scale}px`;
          ({ height, width } = extent());
          const next = Math.min(1, H / Math.max(1, height), (W / scale / Math.max(1, width)) * scale);
          const settled = Math.abs(next - scale) < 0.01;
          scale = Math.min(scale, next);
          if (settled) break;
        }
        if (scale < 0.98) {
          scale = Math.max(0.25, scale);
          content.style.width = `${W / scale}px`;
          content.style.transform = `scale(${scale})`;
        } else reset();
        win.requestAnimationFrame(() => (fitting = false));
      });
    };
    // Watch the blocks themselves too: they load and grow after the box has its size.
    let stop = () => {};
    const watch = () => {
      stop();
      stop = observeSize([box, content, ...content.children], measure);
      measure();
    };
    watch();
    const Mutations = (win as typeof globalThis).MutationObserver;
    const added = Mutations ? new Mutations(watch) : null;
    added?.observe(content, { childList: true });
    return () => {
      win.cancelAnimationFrame(frame);
      added?.disconnect();
      stop();
    };
  }, [fit]);
  return (
    <div ref={outer} className={className} style={style}>
      <div ref={inner} className="osl-fit">
        {children}
      </div>
    </div>
  );
}

/** The outline of a shape in a 100 × 100 box (stretched to the object). */
const SHAPE_PATH: Record<ShapeName, string> = {
  rect: "M0 0H100V100H0Z",
  rounded: "M12 0H88Q100 0 100 12V88Q100 100 88 100H12Q0 100 0 88V12Q0 0 12 0Z",
  ellipse: "M50 0A50 50 0 1 1 49.99 0Z",
  triangle: "M50 0L100 100H0Z",
  diamond: "M50 0L100 50L50 100L0 50Z",
  arrow: "M0 30H62V0L100 50L62 100V70H0Z",
  line: "M0 50H100",
};

function Shape({ shape, style }: { shape: ShapeName; style?: ElementStyle }) {
  const line = shape === "line";
  return (
    <svg className="osl-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={SHAPE_PATH[shape]}
        fill={line ? "none" : (paint(style?.fill) ?? "var(--osl-accent)")}
        stroke={paint(style?.stroke) ?? (line ? "var(--osl-fg)" : "none")}
        strokeWidth={style?.strokeWidth ?? (line ? 3 : 0)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The box styles every object shares: position, fill, border, corners, opacity. */
function boxStyle(el: SlideElement): CSSProperties {
  const s = el.style ?? {};
  return {
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    ...(el.rotate ? { transform: `rotate(${el.rotate}deg)` } : {}),
    ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
    ...(el.kind !== "shape" && s.fill ? { background: paint(s.fill) } : {}),
    ...(el.kind !== "shape" && s.stroke ? { border: `${s.strokeWidth ?? 1}px solid ${paint(s.stroke)}` } : {}),
    ...(s.radius ? { borderRadius: s.radius } : {}),
  };
}

const V_ALIGN = { top: "flex-start", middle: "safe center", bottom: "flex-end" } as const;

/**
 * The inside of a text box or block: its padding, alignment and text size,
 * shrunk to fit. Shared with editors, so text edited in place sits exactly
 * where it will show.
 */
export function ElementBody({ element, fit = true, children }: { element: SlideElement; fit?: boolean; children: ReactNode }) {
  const s = element.style ?? {};
  return (
    <FitBox
      fit={fit}
      className="osl-el-body"
      style={{
        padding: s.padding ?? 0,
        justifyContent: V_ALIGN[s.vAlign ?? "top"],
        ...(s.textAlign ? { textAlign: s.textAlign } : {}),
        ...(s.fontScale ? { fontSize: `${s.fontScale}em` } : {}),
      }}
    >
      {children}
    </FitBox>
  );
}

export function SlideView({
  deck,
  slide,
  step,
  animate = true,
  mode = "live",
  renderBlocks,
  renderCanvas,
  blockSelector,
  morphNames,
  fit = true,
  renderElement,
  children,
}: SlideViewProps) {
  const instance = useId();
  const css = useMemo(() => timelineCss(slide, { instance, step, animate, blockSelector, morphNames }), [instance, slide, step, animate, blockSelector, morphNames]);
  return (
    <div
      className={`osl-slide osl-theme-${deck.theme}`}
      data-osl-slide={slide.id}
      data-osl-instance={instance}
      data-osl-mode={mode}
      style={slide.background ? { background: paint(slide.background) } : undefined}
      // A picture of a slide can't be clicked into or focused.
      inert={mode === "preview" ? true : undefined}
    >
      {css ? <style>{css}</style> : null}
      {slide.elements.map((el) => {
        const ctx = { slide, element: el, mode };
        let content: ReactNode;
        if (el.kind === "text" || el.kind === "block") {
          content = (
            <ElementBody element={el} fit={fit}>
              {renderBlocks(el.blocks, ctx)}
            </ElementBody>
          );
        } else if (el.kind === "shape") content = <Shape shape={el.shape} style={el.style} />;
        else if (el.kind === "image")
          // eslint-disable-next-line @next/next/no-img-element
          content = <img className="osl-image" src={el.src} alt={el.alt ?? ""} style={{ objectFit: el.fit ?? "contain" }} draggable={false} />;
        else content = renderCanvas ? <div className="osl-canvas">{renderCanvas({ canvasId: el.canvasId, itemId: el.itemId }, ctx)}</div> : null;
        return (
          <div key={el.id} className={`osl-el osl-el-${el.kind}${el.kind === "text" && el.role === "title" ? " osl-el-title" : ""}`} data-osl-el={el.id} style={boxStyle(el)}>
            {renderElement ? renderElement(el, content) : content}
          </div>
        );
      })}
      {children}
    </div>
  );
}
