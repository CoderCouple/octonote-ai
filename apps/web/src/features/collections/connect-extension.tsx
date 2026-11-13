"use client";

/**
 * Connects the Octonote Clipper browser extension, PKCE-style: the side panel
 * opens this page with `?challenge=` (the hash of a secret only it holds);
 * this page, signed in, asks the API for a one-time code for that challenge
 * and hands the code to the extension. The extension trades code + secret for
 * its own key, which can only work with collections — and, when the side
 * panel asks with `?read=1` and the person allows it, read the notes,
 * canvases and projects they pick to insert into a chat. No key ever passes
 * through this page. The key shows in Settings → CLI & agents as "Browser
 * extension", where it can be revoked.
 */
import {
  AlertCircle,
  Check,
  Library,
  Loader2,
  PanelRight,
  Puzzle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@octonote/api-client";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/api/client-fetch";

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const DETECT_MS = 1500;
const ANSWER_MS = 15_000;
const NO_ANSWER = "The extension didn't answer — reload it and try again.";

type State =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "ready" }
  | { kind: "connecting" }
  | { kind: "waiting" }
  | { kind: "connected" }
  | { kind: "failed"; message: string };

type ExtensionMessage = {
  source?: string;
  type?: string;
  error?: unknown;
};

function errorText(err: unknown) {
  if (err instanceof ApiError && err.reason) return err.reason;
  return "Couldn't start connecting. Try again.";
}

export function ConnectExtension({
  workspaceId,
  workspaceName,
  challenge,
  read = false,
}: {
  workspaceId: string;
  workspaceName: string;
  challenge: string | null;
  /** The extension asks to read notes, canvases and projects too. */
  read?: boolean;
}) {
  const validChallenge = challenge !== null && CHALLENGE.test(challenge);
  const [state, setState] = useState<State>({ kind: "checking" });
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWaiting = useCallback(() => {
    if (answerTimer.current) clearTimeout(answerTimer.current);
    answerTimer.current = null;
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const data = event.data as ExtensionMessage | null;
      if (data?.source !== "octonote-extension") return;
      if (data.type === "present") {
        setState((s) =>
          s.kind === "checking" || s.kind === "missing" ? { kind: "ready" } : s,
        );
        return;
      }
      // Only an answer to a connect this page started counts.
      if (data.type === "connected") {
        stopWaiting();
        setState((s) => (s.kind === "waiting" ? { kind: "connected" } : s));
      } else if (data.type === "failed") {
        stopWaiting();
        const message =
          typeof data.error === "string" && data.error.trim()
            ? data.error.trim().slice(0, 300)
            : "The extension couldn't finish connecting. Try again.";
        setState((s) =>
          s.kind === "waiting" ? { kind: "failed", message } : s,
        );
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "octonote-web", type: "ping" },
      window.location.origin,
    );
    const detect = setTimeout(
      () => setState((s) => (s.kind === "checking" ? { kind: "missing" } : s)),
      DETECT_MS,
    );
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(detect);
      stopWaiting();
    };
  }, [stopWaiting]);

  const connect = async () => {
    if (!validChallenge) return;
    setState({ kind: "connecting" });
    let code: string;
    try {
      ({ code } = await clientApi.post<{ code: string; expiresAt: string }>(
        "/extension/connect-codes",
        { workspaceId, challenge, ...(read ? { read: true } : {}) },
      ));
    } catch (err) {
      setState({ kind: "failed", message: errorText(err) });
      return;
    }
    setState({ kind: "waiting" });
    stopWaiting();
    answerTimer.current = setTimeout(() => {
      answerTimer.current = null;
      setState((s) =>
        s.kind === "waiting" ? { kind: "failed", message: NO_ANSWER } : s,
      );
    }, ANSWER_MS);
    window.postMessage(
      { source: "octonote-web", type: "connect", code },
      window.location.origin,
    );
  };

  const busy = state.kind === "connecting" || state.kind === "waiting";

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-12">
      <div className="bg-card text-card-foreground w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/octonote-app-icon.svg"
            alt=""
            aria-hidden
            className="size-14 rounded-2xl"
          />
          <h1 className="text-foreground-strong text-xl font-bold tracking-tight">
            {state.kind === "connected"
              ? "Octonote Clipper is connected"
              : "Connect Octonote Clipper"}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Keep the parts of ChatGPT, Claude and Gemini answers you want in a
            collection, then write a note from just those, with every sentence
            cited.
          </p>
        </div>

        <div className="mt-6">
          {state.kind === "checking" ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
              <Loader2 className="size-4 animate-spin" /> Looking for the
              extension…
            </p>
          ) : state.kind === "missing" ? (
            <Notice
              icon={<Puzzle className="size-4" />}
              title="The extension isn't installed in this browser yet"
            >
              While it&apos;s in preview, install it from the repo: build it
              with <code>pnpm --filter @octonote/extension build</code>, open{" "}
              <code>chrome://extensions</code>, turn on Developer mode, choose
              “Load unpacked” and pick <code>apps/extension/dist</code>. Then
              open this page again from the Octonote Clipper side panel.
            </Notice>
          ) : state.kind === "connected" ? (
            <div className="space-y-4">
              <Notice
                icon={<Check className="size-4" />}
                title="You're all set"
              >
                Connected to {workspaceName}. You can close this tab — your
                clips show up in the Octonote side panel.
              </Notice>
              <Button asChild variant="outline" className="w-full">
                <Link href="/workspace/collections">
                  <Library className="size-4" /> Your collections
                </Link>
              </Button>
            </div>
          ) : !validChallenge ? (
            <Notice
              icon={<PanelRight className="size-4" />}
              title="Open this page from the Octonote Clipper side panel"
            >
              Click the Octonote button in your browser toolbar to open the side
              panel, then choose Connect there. This page can only finish a
              connection the extension started.
            </Notice>
          ) : (
            <div className="space-y-4">
              <dl className="bg-muted/40 rounded-xl border px-4 py-3 text-left text-sm">
                <dt className="text-muted-foreground text-xs">Workspace</dt>
                <dd className="text-foreground-strong font-medium">
                  {workspaceName}
                </dd>
                <dt className="text-muted-foreground mt-3 text-xs">
                  What it can access
                </dt>
                <dd className="text-foreground space-y-1">
                  <p>
                    It can add, reorder and remove clips in your collections.
                  </p>
                  {read ? (
                    <p>
                      It can read notes, canvases and projects you choose to
                      insert into a chat. It only reads an item when you pick
                      it.
                    </p>
                  ) : (
                    <p>It can&apos;t read or change your notes.</p>
                  )}
                </dd>
              </dl>
              {state.kind === "failed" ? (
                <p
                  role="alert"
                  className="text-destructive flex items-start gap-2 text-sm"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{state.message}</span>
                </p>
              ) : null}
              <Button
                size="lg"
                className="w-full"
                onClick={() => void connect()}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {state.kind === "waiting"
                  ? "Waiting for the extension…"
                  : state.kind === "connecting"
                    ? "Connecting…"
                    : state.kind === "failed"
                      ? "Try again"
                      : read
                        ? "Allow and connect"
                        : "Connect extension"}
              </Button>
            </div>
          )}
        </div>

        <div className="text-muted-foreground mt-6 border-t pt-4 text-center text-xs">
          The extension gets its own key, listed as “Browser extension”.{" "}
          <Link
            href="/workspace/settings#cli"
            className="text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            <Settings className="size-3" /> Manage or revoke in Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 flex gap-3 rounded-xl border px-4 py-3 text-left text-sm">
      <span className="bg-muted text-foreground-strong mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg">
        {icon}
      </span>
      <div className="space-y-1">
        <p className="text-foreground-strong font-medium">{title}</p>
        <p className="text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
