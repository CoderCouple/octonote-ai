"use client";

/**
 * "New" on Home's Shared-with-you cards: anything shared after you last
 * opened the Shared page. Kept per browser (localStorage) — v1's only
 * notification besides the share email.
 */
import { useEffect, useState } from "react";

const KEY = "octonote:shared-seen-at";

function readSeenAt(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function NewBadge({ sharedAt }: { sharedAt: string }) {
  const [isNew, setIsNew] = useState(false);
  useEffect(() => {
    const seen = readSeenAt();
    setIsNew(!seen || sharedAt > seen);
  }, [sharedAt]);
  if (!isNew) return null;
  return (
    <span className="bg-foreground-strong text-background rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide">
      New
    </span>
  );
}

/** Rendered on the Shared page: opening it marks everything as seen. */
export function MarkSharedSeen() {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      // Private mode: badges just stay until storage works.
    }
  }, []);
  return null;
}
