"use client";

import { useEffect, useState } from "react";

/** Types `text` out once `active` turns true; shows it whole when `done`. */
export function Typed({ text, active, done, caret = true }: { text: string; active: boolean; done?: boolean; caret?: boolean }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!active || done) {
      setN(0);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 38);
    return () => clearInterval(id);
  }, [active, done, text]);

  if (done) return <>{text}</>;
  if (!active) return null;
  return (
    <>
      {text.slice(0, n)}
      {caret && n < text.length ? (
        <span className="bg-foreground ml-px inline-block h-[1em] w-px translate-y-[2px] animate-pulse" aria-hidden />
      ) : null}
    </>
  );
}
