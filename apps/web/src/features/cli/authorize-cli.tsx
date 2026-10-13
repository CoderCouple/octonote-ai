"use client";

/**
 * The Authorize button on /cli/connect. Everything happens in this page:
 * create the token with your web session, then hand it straight to the CLI
 * waiting on this computer (POST to its 127.0.0.1 listener, which checks
 * `state` and only accepts this site's origin). The token never appears in
 * a URL. If the browser won't reach localhost, the token is shown once to
 * paste into the terminal instead.
 */
import { Check, Copy, Loader2, Terminal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/api/client-fetch";
import { CliScreen } from "./cli-screen";

type Status =
  | { kind: "ready" }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "paste"; token: string }
  | { kind: "error"; message: string };

export function AuthorizeCli({
  cb,
  state,
  device,
  email,
}: {
  cb: string;
  state: string;
  device: string;
  email: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "ready" });
  const [copied, setCopied] = useState(false);

  async function authorize() {
    setStatus({ kind: "working" });
    let token: string;
    try {
      ({ plaintext: token } = await clientApi.post<{ plaintext: string }>(
        "/me/cli-tokens",
        {
          name: `CLI · ${device}`,
        },
      ));
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message.replace(/^Octonote API \S+ \d+: /, "")
            : "Couldn't create a token.",
      });
      return;
    }
    try {
      const res = await fetch(cb, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, token, email }),
      });
      if (!res.ok) throw new Error(`CLI answered ${res.status}`);
      setStatus({ kind: "done" });
    } catch {
      // Browser blocked localhost (or the CLI stopped waiting): paste instead.
      setStatus({ kind: "paste", token });
    }
  }

  if (status.kind === "done") {
    return (
      <CliScreen
        icon={<Check className="size-5" />}
        title="Your CLI is connected"
        body={
          <>
            Signed in as <b>{email}</b>. You can close this tab and go back to
            your terminal.
          </>
        }
      />
    );
  }
  if (status.kind === "paste") {
    return (
      <CliScreen
        icon={<Terminal className="size-5" />}
        title="One more step"
        body="Your browser didn't let this page reach the CLI. Copy this token and paste it into the terminal where `octonote login` is waiting (or pipe it into `octonote login --paste`). It's shown only once."
      >
        <code className="bg-muted w-full rounded-xl border px-3 py-3 text-left font-mono text-xs break-all">
          {status.token}
        </code>
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={() => {
            void navigator.clipboard
              .writeText(status.token)
              .then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy token"}
        </Button>
      </CliScreen>
    );
  }

  return (
    <CliScreen
      icon={<Terminal className="size-5" />}
      title="Connect the Octonote CLI?"
      body="The CLI — and agents like Claude Code or Codex that use it — will be able to create, edit, publish and share your notes, canvases, projects and notebooks."
    >
      <dl className="bg-muted/40 w-full rounded-xl border px-4 py-3 text-left text-sm">
        <dt className="text-muted-foreground text-xs">Account</dt>
        <dd className="text-foreground-strong font-medium">{email}</dd>
        <dt className="text-muted-foreground mt-3 text-xs">Computer</dt>
        <dd className="text-foreground-strong font-medium">{device}</dd>
      </dl>
      {status.kind === "error" ? (
        <p className="text-destructive text-sm">{status.message}</p>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        onClick={authorize}
        disabled={status.kind === "working"}
      >
        {status.kind === "working" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : null}
        Authorize
      </Button>
      <p className="text-muted-foreground text-xs">
        Didn&apos;t run <code>octonote login</code>? Close this tab — nothing is
        created. You can revoke CLI access any time in Settings → CLI &amp;
        agents.
      </p>
    </CliScreen>
  );
}
