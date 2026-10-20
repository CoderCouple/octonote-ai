"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A macOS-style terminal for marketing pages (black on light pages, white on
 * dark ones), with the three
 * window buttons, a title and a copy button. Lines starting with `#` are
 * comments (shown dimmed, never copied); `octonote` is bold.
 */
export function TerminalWindow({
  title = "terminal",
  code,
}: {
  title?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyText = code
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return (
    <div className="border-terminal-border bg-terminal text-terminal-foreground overflow-hidden rounded-2xl border text-left shadow-xl">
      <div className="border-terminal-border flex h-10 items-center gap-2 border-b px-4">
        <span className="bg-terminal-close size-3 rounded-full" />
        <span className="bg-terminal-minimize size-3 rounded-full" />
        <span className="bg-terminal-zoom size-3 rounded-full" />
        <span className="text-terminal-muted ml-2 text-xs">{title}</span>
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy"}
          onClick={() => {
            void navigator.clipboard.writeText(copyText).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="text-terminal-muted hover:text-terminal-foreground ml-auto grid size-7 place-items-center rounded-md transition-colors"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-7 md:px-6 md:py-5 md:text-sm">
        <code>
          {code.split("\n").map((line, i) => (
            <div key={i} className="min-h-7">
              <Line text={line} />
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Line({ text }: { text: string }) {
  if (text.trimStart().startsWith("#"))
    return <span className="text-terminal-muted">{text}</span>;
  // A trailing "  # comment" after a command.
  const hash = text.search(/\s{2,}#\s/);
  if (hash > 0)
    return (
      <>
        <Line text={text.slice(0, hash)} />
        <span className="text-terminal-muted">{text.slice(hash)}</span>
      </>
    );
  // Split into words and quoted strings, keeping the spaces between them.
  const parts = text.match(/"[^"]*"|\s+|[^\s"]+/g) ?? [];
  return (
    <>
      {parts.map((p, i) => {
        const word = p.replace(/^[^\w-]*\(?/, "");
        if (/^octonote\b/.test(word) || p === "octonote")
          return (
            <span key={i}>
              {p.slice(0, p.indexOf("octonote"))}
              <span className="text-terminal-command font-semibold">
                octonote
              </span>
              {p.slice(p.indexOf("octonote") + "octonote".length)}
            </span>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}
