"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The assistant demo (public/media): plays muted on a loop like a moving
 * screenshot; with reduced motion it stays on the poster with controls.
 */
export function DemoVideo({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      ref.current?.pause();
    }
  }, []);

  return (
    <video
      ref={ref}
      className="bg-card w-full rounded-2xl border shadow-sm"
      src="/media/octonote-assistant-demo.mp4"
      poster="/media/octonote-assistant-demo-poster.jpg"
      width={1920}
      height={1080}
      autoPlay={!reduced}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced}
      aria-label={label}
    />
  );
}
