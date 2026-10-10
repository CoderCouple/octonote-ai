"use client";

import dynamic from "next/dynamic";

export const CanvasReadOnly = dynamic(
  () => import("./canvas-readonly-impl").then((m) => m.CanvasReadOnlyImpl),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground grid h-full place-items-center text-sm">
        Loading canvas…
      </div>
    ),
  },
);
