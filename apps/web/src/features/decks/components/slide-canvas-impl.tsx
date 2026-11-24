"use client";

import { OctoCanvas, type OctoCanvasHandle } from "@octonote/octodraw";
import { useEffect, useMemo, useRef } from "react";
import { toCanvasDocument } from "@/features/canvas/lib/document";
import { CANVAS_THEMES } from "@/features/canvas/lib/octodraw-theme";

const noop = () => undefined;

/**
 * A canvas on a slide: the deck's copy of it, zoomed to one frame or figure
 * (or the whole canvas). A picture, not a workspace: no panning or controls.
 */
export function SlideCanvasImpl({ document, itemId, dark }: { document: unknown; itemId: string | null; dark: boolean }) {
  const doc = useMemo(() => toCanvasDocument(document), [document]);
  const handle = useRef<OctoCanvasHandle>(null);
  useEffect(() => {
    // Wait a frame so the canvas knows its size.
    const frame = requestAnimationFrame(() => {
      if (itemId) handle.current?.focusItem(itemId);
      else handle.current?.zoomToFit();
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, itemId]);
  return (
    <div className="pointer-events-none absolute inset-0 [&_.occ-chrome]:!hidden">
      <OctoCanvas
        ref={handle}
        doc={doc}
        onChange={noop}
        readOnly
        grid={false}
        colorScheme={dark ? "dark" : "light"}
        themes={CANVAS_THEMES}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}
