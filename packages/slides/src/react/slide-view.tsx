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

/**
 * A slide region that scales its content down (never up) to fit. Uses a
 * transform, not CSS zoom: editors' menus and carets (BlockNote's floating
 * UI) position correctly under transforms. The content is laid out wider by
 * the same factor first, so text still wraps across the region's full width.
 */
function Region({ className, fit, children }: { className: string; fit: boolean; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const reset = () => {
      content.style.transform = "";
      content.style.width = "";
      content.style.height = "";
    };
    if (!fit) {
      reset();
      return;
    }
    // The region's own window: it may be the presenter view's.
    const win = box.ownerDocument.defaultView ?? window;
    /** How tall and wide the blocks really are (a stretched wrapper's own size says nothing). */
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
          content.style.height = `${H / scale}px`;
          ({ height, width } = extent());
          const next = Math.min(1, H / Math.max(1, height), (W / scale) / Math.max(1, width) * scale);
          if (Math.abs(next - scale) < 0.01) {
            scale = Math.min(scale, next);
            break;
          }
          scale = Math.min(scale, next);
        }
        if (scale < 0.98) {
          scale = Math.max(0.3, scale);
          content.style.width = `${W / scale}px`;
          content.style.height = `${H / scale}px`;
          content.style.transform = `scale(${scale})`;
        } else reset();
        // Let the observers see this layout before measuring again.
        win.requestAnimationFrame(() => (fitting = false));
      });
    };
    // Watch the blocks themselves too: a region that stretches to fill the slide
    // keeps its own size when a block inside it loads or grows (a mind map, an app).
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
    <div ref={outer} className={className}>
      <div ref={inner} className="osl-fit">
        {children}
      </div>
    </div>
  );
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
