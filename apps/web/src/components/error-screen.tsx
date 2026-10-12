/**
 * The one look for "something's wrong" pages: not-found, route errors and the
 * global error boundary. A big muted code, a title, one line of help, actions.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorScreen({
  code,
  title,
  message,
  reference,
  actions,
  fullScreen = true,
}: {
  code: string;
  title: string;
  message: string;
  /** Next's error digest — lets a user quote the error without exposing details. */
  reference?: string;
  actions: ReactNode;
  /** false inside the workspace/editor shells, so the sidebar stays put. */
  fullScreen?: boolean;
}) {
  return (
    <main
      className={cn(
        "bg-background flex flex-col items-center justify-center px-4 py-16",
        fullScreen ? "min-h-svh" : "h-full min-h-[60svh]",
      )}
    >
      <div className="flex max-w-lg flex-col items-center text-center">
        <p className="text-foreground-subtle mb-4 text-7xl font-semibold tracking-tighter tabular-nums sm:text-8xl">
          {code}
        </p>
        <h1 className="text-foreground-strong mb-4 text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          {message}
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          {actions}
        </div>
      </div>
      <footer className="text-muted-foreground mt-12 space-y-1 text-center text-sm">
        <p>If you believe this is an error, please contact our support team.</p>
        {reference ? (
          <p className="font-mono text-xs">Reference: {reference}</p>
        ) : null}
      </footer>
    </main>
  );
}
