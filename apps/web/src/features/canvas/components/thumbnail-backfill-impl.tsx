"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadSnapshot,
  Tldraw,
  type Editor,
  type TLStoreSnapshot,
} from "tldraw";
import { env } from "@/env/client";
import { clientApi } from "@/lib/api/client-fetch";
import { uploadCanvasThumbnail } from "../lib/thumbnail";
import { SHAPE_UTILS } from "../shapes/figure-shape";
import type { Canvas } from "../types";

const TLDRAW_LICENSE_KEY = env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined;

/**
 * Renders each canvas off screen, one at a time, and uploads its thumbnail
 * — the same picture the editor makes when the canvas is opened.
 */
export function ThumbnailBackfillImpl({
  canvasIds,
  onDone,
}: {
  canvasIds: string[];
  onDone: (madeAny: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [madeAny, setMadeAny] = useState(false);
  const id = canvasIds[index];
  // tldraw can mount twice in dev (StrictMode); render each canvas once.
  const started = useRef(new Set<string>());

  useEffect(() => {
    if (!id) {
      onDone(madeAny);
      return;
    }
    let live = true;
    setCanvas(null);
    clientApi
      .get<Canvas>(`/canvases/${id}`)
      .then((c) => live && setCanvas(c))
      .catch(() => live && setIndex((i) => i + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !canvas || canvas.id !== id) return null;

  async function onMount(editor: Editor) {
    if (started.current.has(id!)) return;
    started.current.add(id!);
    const doc = canvas!.document as TLStoreSnapshot | null;
    try {
      if (doc && Object.keys(doc).length > 0) {
        loadSnapshot(editor.store, doc);
        const url = await uploadCanvasThumbnail(editor, id!, null);
        if (url) setMadeAny(true);
      }
    } catch (err) {
      // Viewers can't update the canvas; empty or broken ones are skipped.
      console.warn("Thumbnail backfill skipped", id, err);
    }
    setIndex((i) => i + 1);
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 -left-[10000px] h-[600px] w-[800px] opacity-0"
    >
      <Tldraw
        key={id}
        onMount={(editor) => void onMount(editor)}
        hideUi
        licenseKey={TLDRAW_LICENSE_KEY}
        shapeUtils={SHAPE_UTILS}
      />
    </div>
  );
}
