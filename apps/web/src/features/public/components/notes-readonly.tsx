"use client";

import dynamic from "next/dynamic";

export const NotesReadOnly = dynamic(
  () => import("./notes-readonly-impl").then((m) => m.NotesReadOnlyImpl),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground py-10 text-sm">Loading…</div>
    ),
  },
);
