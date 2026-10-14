"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { NotesReadOnlyImplProps } from "./notes-readonly-impl";
import { StaticNote } from "./static-note";

const NotesReadOnlyEditor = dynamic(
  () => import("./notes-readonly-impl").then((m) => m.NotesReadOnlyImpl),
  { ssr: false },
);

/**
 * The published note body. The server sends a plain HTML version
 * (StaticNote) so crawlers read the text and the page has its full height
 * at once; BlockNote mounts hidden behind it and swaps in when it's loaded.
 */
export function NotesReadOnly({ onLoaded, ...props }: NotesReadOnlyImplProps) {
  const [ready, setReady] = useState(false);
  return (
    <>
      {ready ? null : <StaticNote document={props.initialContent} />}
      <div hidden={!ready}>
        <NotesReadOnlyEditor
          {...props}
          onLoaded={(blocks) => {
            onLoaded?.(blocks);
            setReady(true);
          }}
        />
      </div>
    </>
  );
}
