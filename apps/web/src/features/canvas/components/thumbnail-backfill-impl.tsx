"use client";

import { useEffect, useRef } from "react";
import { clientApi } from "@/lib/api/client-fetch";
import { toCanvasDocument } from "../lib/document";
import { uploadCanvasThumbnail } from "../lib/thumbnail";
import type { Canvas } from "../types";

/**
 * Renders each canvas's document to a PNG, one at a time, and uploads it —
 * the same picture the editor makes when the canvas is opened. Nothing is
 * mounted: octodraw renders the document straight to SVG.
 */
export function ThumbnailBackfillImpl({
  canvasIds,
  onDone,
}: {
  canvasIds: string[];
  onDone: (madeAny: boolean) => void;
}) {
  const key = canvasIds.join(",");
  // React may run the effect twice in dev (StrictMode); render each canvas once.
  const started = useRef(new Set<string>());
  useEffect(() => {
    let live = true;
    void (async () => {
      let madeAny = false;
      for (const id of canvasIds) {
        if (!live) return;
        if (started.current.has(id)) continue;
        started.current.add(id);
        try {
          const canvas = await clientApi.get<Canvas>(`/canvases/${id}`);
          const doc = toCanvasDocument(canvas.document);
          if (doc.items.length === 0) continue;
          if (await uploadCanvasThumbnail(doc, id, null)) madeAny = true;
        } catch (err) {
          // Viewers can't update the canvas; empty or broken ones are skipped.
          console.warn("Thumbnail backfill skipped", id, err);
        }
      }
      if (live) onDone(madeAny);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
