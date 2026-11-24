import { useId, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { DeckDocument, DeckSlide, NoteBlock, SlideCanvas } from "../model.js";
import { observeSize } from "./stage.js";

/** Where blocks are drawn: a live slide, or a small non-interactive picture of one (presenter view, thumbnails). */
export type SlideMode = "live" | "preview";

export interface SlideRenderers {
  /**
   * Draws a region's note blocks. The host app owns the block renderer (its
   * editor schema), so slides can hold anything a note can. Each drawn block
   * must carry its id in `blockIdAttribute` for builds and morphs to find it.
   */
  renderBlocks: (blocks: NoteBlock[], ctx: { slide: DeckSlide; region: "main" | "side"; mode: SlideMode }) => ReactNode;
  /** Draws a canvas zoomed to one of its frames or figures (canvas slides). */
  renderCanvas?: (canvas: SlideCanvas, ctx: { slide: DeckSlide; mode: SlideMode }) => ReactNode;
  /** The attribute that holds a drawn block's id. BlockNote uses `data-id`. */
  blockIdAttribute?: string;
  /**
   * The CSS selector for one drawn block, when the id attribute alone matches
   * more than one element (BlockNote marks a block's outer and inner element
   * alike). Builds and morphs must name exactly one element per block.
   */
  blockSelector?: (attributeMatch: string) => string;
}

export interface SlideViewProps extends SlideRenderers {
  deck: Pick<DeckDocument, "theme">;
  slide: DeckSlide;
  /** How many of the slide's builds are showing; omit to show everything (editing, thumbnails). */
  step?: number;
  mode?: SlideMode;
  /** Shared by blocks that appear on both slides of a `morph` transition. */
  morphNames?: Map<string, string>;
  /**
   * Shrink a region whose blocks are taller or wider than it (a long quiz, a
   * big mind map) so the whole slide shows. On by default; the editor turns it
   * off so authors see the real size and what spills over.
   */
  fit?: boolean;
}

/**
 * A slide region that scales its content down (never up) to fit. Uses CSS
 * `zoom`, which shrinks layout too, so text re-wraps at the smaller size and
 * clicks still land where they look.
 */
function Region({ className, fit, children }: { className: string; fit: boolean; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    if (!fit) {
      content.style.zoom = "";
      return;
    }
    // The region's own window: it may be the presenter view's.
    const win = box.ownerDocument.defaultView ?? window;
    let frame = 0;
    const measure = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => {
        content.style.zoom = "";
        const scale = Math.min(1, box.clientHeight / Math.max(1, content.scrollHeight), box.clientWidth / Math.max(1, content.scrollWidth));
        // Small overflows (a pixel of rounding) aren't worth shrinking for.
        if (scale < 0.98) content.style.zoom = String(Math.max(0.3, scale));
      });
    };
    measure();
    const stop = observeSize([box, content], measure);
    return () => {
      win.cancelAnimationFrame(frame);
      stop();
    };
  }, [fit]);
  return (
    <div ref={outer} className={className}>
      <div ref={inner} className="osl-fit">
        {children}
      </div>
    </div>
  );
}

const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

/**
 * The CSS that plays a slide's builds: blocks not reached yet are hidden, the
 * one just revealed animates in with its effect. A `highlight` build stays
 * visible and lights up on its click.
 */
export function buildCss(
  instance: string,
  slide: DeckSlide,
  step: number | undefined,
  attribute: string,
  morphNames?: Map<string, string>,
  blockSelector: (attributeMatch: string) => string = (m) => m,
): string {
  // Scoped to this one drawing: the same slide can be on screen twice (the editor behind the presenter, previews).
  const scope = `[data-osl-instance=${quote(instance)}]`;
  const block = (id: string) => `${scope} ${blockSelector(`[${attribute}=${quote(id)}]`)}`;
  const rules: string[] = [];
  (slide.builds ?? []).forEach((build, i) => {
    if (step === undefined) return;
    const target = block(build.blockId);
    if (i >= step && build.effect !== "highlight") rules.push(`${target}{visibility:hidden;opacity:0}`);
    else if (i === step - 1) rules.push(`${target}{animation:osl-build-${build.effect} var(--osl-build-ms,450ms) var(--osl-ease) both}`);
  });
  for (const [blockId, name] of morphNames ?? []) rules.push(`${block(blockId)}{view-transition-name:${name}}`);
  return rules.join("\n");
}

export function SlideView({ deck, slide, step, mode = "live", renderBlocks, renderCanvas, blockIdAttribute = "data-id", blockSelector, morphNames, fit = true }: SlideViewProps) {
  const instance = useId();
  const css = useMemo(
    () => buildCss(instance, slide, step, blockIdAttribute, morphNames, blockSelector),
    [instance, slide, step, blockIdAttribute, morphNames, blockSelector],
  );
  const canvasOnSlide = slide.layout === "canvas" && slide.canvas;
  return (
    <div
      className={`osl-slide osl-theme-${deck.theme} osl-layout-${slide.layout}`}
      data-osl-slide={slide.id}
      data-osl-instance={instance}
      data-osl-mode={mode}
      // A picture of a slide can't be clicked into or focused.
      inert={mode === "preview" ? true : undefined}
    >
      {css ? <style>{css}</style> : null}
      {canvasOnSlide && renderCanvas ? <div className="osl-canvas">{renderCanvas(slide.canvas!, { slide, mode })}</div> : null}
      <Region className="osl-region osl-main" fit={fit}>
        {renderBlocks(slide.main, { slide, region: "main", mode })}
      </Region>
      {slide.layout === "split" ? (
        <Region className="osl-region osl-side" fit={fit}>
          {renderBlocks(slide.side, { slide, region: "side", mode })}
        </Region>
      ) : null}
    </div>
  );
}
