"use client";

import { useFeedback } from "./feedback-provider";

/** The quiet row at the bottom of Home. */
export function FeedbackRow() {
  const open = useFeedback();
  const link = "text-foreground-strong min-h-8 font-medium underline-offset-4 hover:underline";
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 text-sm">
      <span>Something wrong, or something missing?</span>
      <button type="button" className={link} onClick={() => open("bug")}>
        Report a bug
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" className={link} onClick={() => open("feature")}>
        Request a feature
      </button>
    </div>
  );
}
