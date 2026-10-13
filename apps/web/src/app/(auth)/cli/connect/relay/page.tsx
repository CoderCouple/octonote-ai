"use client";

/**
 * Last hop of `octonote login`: hands the new token to the CLI listening on
 * this computer. The token arrives in the URL fragment (never sent to any
 * server) and is cleared from the address bar straight away. If the browser
 * won't let the page reach localhost, it shows the token once to paste
 * into `octonote login --paste` instead.
 */
import { Check, Copy, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkCliCallback } from "@/features/cli/callback";
import { CliScreen } from "@/features/cli/cli-screen";

type Status =
  | { kind: "sending" }
  | { kind: "done"; email: string }
  | { kind: "paste"; token: string }
  | { kind: "error"; message: string };

export default function CliRelayPage() {
  const [status, setStatus] = useState<Status>({ kind: "sending" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // The token must not survive in history or a refresh.
    window.history.replaceState(null, "", window.location.pathname);
    const token = params.get("token");
    const email = params.get("email") ?? "";
    const check = checkCliCallback(params.get("cb"), params.get("state"));
    if (!token || !check.ok) {
      setStatus({
        kind: "error",
        message:
          "This page was opened without a sign-in in progress. Run `octonote login` again.",
      });
      return;
    }
    fetch(check.cb, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: check.state, token, email }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`CLI answered ${res.status}`);
        setStatus({ kind: "done", email });
      })
      .catch(() => setStatus({ kind: "paste", token }));
  }, []);

  if (status.kind === "sending") {
    return (
      <CliScreen title="Connecting your CLI…" body="This takes a moment." />
    );
  }
  if (status.kind === "done") {
    return (
      <CliScreen
        icon={<Check className="size-5" />}
        title="Your CLI is connected"
        body={
          <>
            Signed in
            {status.email ? (
              <>
                {" "}
                as <b>{status.email}</b>
              </>
            ) : null}
            . You can close this tab and go back to your terminal.
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
        body="Your browser didn't let this page reach the CLI. Copy this token and paste it where `octonote login` is waiting (or run `octonote login --paste`). It's shown only once."
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
  return <CliScreen title="Can't connect the CLI" body={status.message} />;
}
