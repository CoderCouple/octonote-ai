"use client";

import dynamic from "next/dynamic";

/**
 * The live interactive-blocks demo, loaded in the browser only: it brings the
 * widgets, interactive and motion libraries, which the rest of the page doesn't need.
 */
export const InteractiveNotesDemo = dynamic(() => import("./interactive-demo").then((m) => m.InteractiveDemo), {
  ssr: false,
  loading: () => <div className="bg-card min-h-[720px] rounded-2xl border shadow-lg" aria-hidden />,
});
