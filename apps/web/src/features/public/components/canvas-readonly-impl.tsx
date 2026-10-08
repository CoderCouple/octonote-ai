"use client";

import { useMemo } from "react";
import { loadSnapshot, Tldraw, type Editor, type TLStoreSnapshot } from "tldraw";
import { env } from "@/env/client";

// The public page runs on the production domain too, so it needs the key as well.
const TLDRAW_LICENSE_KEY = env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY || undefined;

export function CanvasReadOnlyImpl({ initialDocument }: { initialDocument: unknown }) {
  const snapshot = useMemo<TLStoreSnapshot | null>(() => {
    if (initialDocument && typeof initialDocument === "object" && Object.keys(initialDocument).length > 0) {
      return initialDocument as TLStoreSnapshot;
    }
    return null;
  }, [initialDocument]);

  function onMount(editor: Editor) {
    if (snapshot) {
      try {
        loadSnapshot(editor.store, snapshot);
      } catch (err) {
        console.error("Failed to load canvas snapshot", err);
      }
    }
    editor.updateInstanceState({ isReadonly: true });
    // zoomToFit on an empty page collapses the viewport.
    setTimeout(() => {
      if (editor.getCurrentPageShapes().length > 0) editor.zoomToFit({ animation: { duration: 0 } });
    }, 0);
  }

  return (
    <div className="bg-background relative h-full w-full">
      <div className="absolute inset-0">
        <Tldraw onMount={onMount} hideUi licenseKey={TLDRAW_LICENSE_KEY} />
      </div>
    </div>
  );
}
