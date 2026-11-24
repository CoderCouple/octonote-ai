"use client";

import dynamic from "next/dynamic";

// octodraw is large and touches the DOM: load it only for canvas slides, client-side.
export const SlideCanvas = dynamic(() => import("./slide-canvas-impl").then((m) => m.SlideCanvasImpl), {
  ssr: false,
  loading: () => <div className="absolute inset-0" />,
});
