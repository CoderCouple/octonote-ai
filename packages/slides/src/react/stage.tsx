import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DeckAspect } from "../model.js";

/**
 * Watches an element's size with its own window's ResizeObserver. A slide
 * can be drawn into another window (the presenter view), and an observer
 * from the opener doesn't see layout changes there. Also re-measures when
 * that window resizes or finishes loading its stylesheets.
 */
export function observeSize(elements: Element[], onChange: () => void): () => void {
  const win = elements[0]?.ownerDocument.defaultView;
  if (!win) return () => {};
  const RO = (win as typeof globalThis).ResizeObserver;
  const observer = RO ? new RO(() => onChange()) : null;
  for (const el of elements) observer?.observe(el);
  win.addEventListener("resize", onChange);
  win.addEventListener("load", onChange);
  // Stylesheets copied into a new window load after the first measurement.
  const sheets = [...win.document.querySelectorAll('link[rel="stylesheet"]')];
  for (const s of sheets) s.addEventListener("load", onChange);
  return () => {
    observer?.disconnect();
    win.removeEventListener("resize", onChange);
    win.removeEventListener("load", onChange);
    for (const s of sheets) s.removeEventListener("load", onChange);
  };
}

/**
 * Slides are laid out at a fixed size and scaled to fit, so a slide looks the
 * same on every screen. The size is close to a note's column (960 px), so
 * blocks' own controls (buttons, menus, sliders) keep the proportions they
 * were designed at, and the editor shows them near 1:1.
 */
export const STAGE_SIZE: Record<DeckAspect, { width: number; height: number }> = {
  "16:9": { width: 960, height: 540 },
  "4:3": { width: 720, height: 540 },
};

export interface SlideStageProps {
  aspect: DeckAspect;
  /**
   * - width (default): as wide as the parent, as tall as the slide needs
   *   (presenter view, published page, thumbnails).
   * - contain: as large as fits a parent of fixed height (full screen, the
   *   editor's stage), centred, with bars on the long side.
   */
  fit?: "width" | "contain";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** A box of the deck's aspect ratio, sized by `fit`, that scales the fixed-size slide inside it. */
export function SlideStage({ aspect, fit: mode = "width", children, className, style }: SlideStageProps) {
  const size = STAGE_SIZE[aspect];
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => {
      // clientWidth/Height: layout size, unaffected by any scaling around the stage.
      const width = el.clientWidth;
      const height = el.clientHeight;
      const s = mode === "contain" && height > 0 ? Math.min(width / size.width, height / size.height) : width / size.width;
      setScale(Number.isFinite(s) && s > 0 ? s : 0);
    };
    fit();
    return observeSize([el], fit);
  }, [size.width, size.height, mode]);
  return (
    <div ref={outer} className={`osl-stage osl-stage-${mode} ${className ?? ""}`} style={style}>
      <div
        className="osl-stage-box"
        style={{ width: size.width * scale, height: size.height * scale, visibility: scale ? undefined : "hidden" }}
      >
        <div className="osl-stage-inner" style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
