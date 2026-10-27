"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A read-only value with a copy button (the connector URL on /claude and /chatgpt). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-card flex w-full max-w-xl items-center gap-2 rounded-xl border p-1.5 pl-4">
      <span className="text-muted-foreground hidden shrink-0 text-sm sm:inline">{label}</span>
      <code className="text-foreground-strong min-w-0 flex-1 truncate font-mono text-sm">{value}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
