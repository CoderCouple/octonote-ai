"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * A headline word that cycles through `words`, each one lifting into place
 * like the hero's. Pauses off screen; with reduced motion it stays on the
 * first word. Screen readers get every word once, not the rotation.
 */
export function RotatingWord({ words, ms = 2200 }: { words: string[]; ms?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.5);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), ms);
    return () => clearInterval(id);
  }, [inView, ms, words.length]);

  return (
    <span ref={ref}>
      <span className="sr-only">{words.join(", ")}</span>
      <span key={i} aria-hidden className="animate-word-rise inline-block">
        {words[i]}
      </span>
    </span>
  );
}
