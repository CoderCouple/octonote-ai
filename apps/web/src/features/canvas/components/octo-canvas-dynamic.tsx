"use client";

import dynamic from "next/dynamic";

// tldraw needs window/canvas APIs at mount; without ssr:false the first paint
// races with hydration and the editor sometimes never initializes its layout.
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

export type { OctoCanvasProps } from "./octo-canvas";
