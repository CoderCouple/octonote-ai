"use client";

import { motion } from "@octonote/design-tokens";
import { useEffect, useState } from "react";
import { useInView } from "@/hooks/use-in-view";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Drives a looping feature demo: advances 0 → steps-1 while the demo is on
 * screen, holds on the final frame, then restarts. Off screen it pauses;
 * with reduced motion it shows the finished frame and never moves.
 */
export function useDemoStep<T extends HTMLElement>(steps: number) {
  const { ref, inView } = useInView<T>(0.4);
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const last = steps - 1;

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setTimeout(
      () => setStep((s) => (s >= last ? 0 : s + 1)),
      step >= last ? motion.demoHoldMs : motion.demoStepMs,
    );
    return () => clearTimeout(id);
  }, [step, inView, reduced, last]);

  return { ref, step: reduced ? last : step, reduced };
}
