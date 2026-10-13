"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** A command or file snippet with a copy button. `$ ` prefixes are shown but not copied. */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyText = code
    .split("\n")
    .map((l) => l.replace(/^\$ /, ""))
    .join("\n");
  return (
    <div
      className={cn(
        "bg-muted/50 group relative overflow-hidden rounded-xl border",
        className,
      )}
    >
      {label ? (
        <div className="text-muted-foreground border-b px-4 py-2 font-mono text-xs">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() => {
          void navigator.clipboard.writeText(copyText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={cn(
          "bg-background text-muted-foreground hover:text-foreground-strong absolute top-2 right-2 grid size-8 place-items-center rounded-md border transition-opacity",
          label ? "top-1" : "",
          "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
        )}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
