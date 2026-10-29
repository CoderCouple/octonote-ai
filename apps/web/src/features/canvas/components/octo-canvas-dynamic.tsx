"use client";

import dynamic from "next/dynamic";

// The canvas measures its container and text with browser APIs at mount, and
// octodraw is large: load it on the client, in its own chunk.
export const OctoCanvas = dynamic(
  () => import("./octo-canvas").then((m) => m.OctoCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Loading canvas…
      </div>
    ),
  },
);

export type { CanvasEditorApi, OctoCanvasProps } from "./octo-canvas";
