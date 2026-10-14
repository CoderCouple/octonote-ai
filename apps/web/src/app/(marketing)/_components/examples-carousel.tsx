"use client";

import { Children, useEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

const AUTO_MS = 1000;
/** After a swipe or tap, wait this long before auto-scrolling again. */
const RESUME_MS = 6000;

/**
 * Phones: one card at a time, centred, with the previous and next cards
 * peeking in at the edges. It advances on its own while on screen (pausing
 * while the reader touches it, and never with reduced motion); dots show the
 * position and can be clicked, so it also works with a mouse.
 */
export function ExamplesCarousel({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const { ref: viewRef, inView } = useInView<HTMLDivElement>(0.5);
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (!card) return;
      const step = card.offsetWidth + 12; // card + gap-3
      setActive(Math.round(el.scrollLeft / step));
    };
    const pause = () => {
      pausedUntil.current = Date.now() + RESUME_MS;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("wheel", pause, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("wheel", pause);
    };
  }, []);

  // Scroll only the row (scrollIntoView would also move the page).
  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({
      left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!inView || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      go((active + 1) % items.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [inView, active, items.length]);

  return (
    <div ref={viewRef} className="-mx-4">
      <div
        ref={track}
        className="hide-scrollbar relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9vw] pb-1"
      >
        {items.map((child, i) => (
          <div key={i} className="flex w-[82vw] shrink-0 snap-center">
            {child}
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show example ${i + 1}`}
            onClick={() => {
              pausedUntil.current = Date.now() + RESUME_MS;
              go(i);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === active ? "bg-foreground-strong w-5" : "bg-border w-1.5",
            )}
          />
        ))}
      </div>
    </div>
  );
}
