"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders into the public site header, between the logo and "Make your
 * own" — so a full-screen page (the published canvas) can put its title
 * bar there on desktop instead of spending a second row on it.
 */
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById("pub-header-slot")), []);
  return el ? createPortal(children, el) : null;
}
