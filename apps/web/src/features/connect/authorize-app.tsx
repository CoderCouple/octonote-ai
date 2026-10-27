"use client";

/**
 * Allow / Deny for an assistant app on /connect/authorize. Approving with
 * your web session gives the app a one-time code; the browser then returns
 * to the app, which swaps the code for tokens. Tokens never pass through
 * this page.
 */
import { Bot, Loader2, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/api/client-fetch";
import { CliScreen } from "@/features/cli/cli-screen";

interface RequestInfo {
  clientName: string;
  clientUri: string | null;
  redirectHost: string;
  local: boolean;
  verified: boolean;
}

const cleanError = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message.replace(/^Octonote API \S+ \d+: /, "") : fallback;

export function AuthorizeApp({ requestId, email }: { requestId: string; email: string }) {
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);

  useEffect(() => {
    clientApi
      .get<RequestInfo>(`/oauth/requests/${requestId}`)
      .then(setInfo)
      .catch((err) => setError(cleanError(err, "This sign-in link has expired. Start again from the app.")));
  }, [requestId]);

  async function answer(kind: "allow" | "deny") {
    setBusy(kind);
    try {
      const { redirect } = await clientApi.post<{ redirect: string }>(
        `/oauth/requests/${requestId}/${kind === "allow" ? "approve" : "deny"}`,
        {},
      );
      window.location.assign(redirect);
    } catch (err) {
      setBusy(null);
      setError(cleanError(err, "Couldn't finish connecting. Start again from the app."));
    }
  }

  if (error) return <CliScreen title="Can't connect" body={error} />;
  if (!info) {
    return <CliScreen title="Connect an app" body={<Loader2 className="mx-auto size-5 animate-spin" />} />;
  }

  return (
    <CliScreen
      icon={info.local ? <MonitorSmartphone className="size-5" /> : <Bot className="size-5" />}
      title={`Connect ${info.clientName} to Octonote?`}
      body={`${info.clientName} will be able to read, create and edit your notes, canvases, projects and notebooks, and publish or share them when you ask it to.`}
    >
      <dl className="bg-muted/40 w-full space-y-2 rounded-xl border px-4 py-3 text-left text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">Account</dt>
          <dd className="text-foreground-strong font-medium">{email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Returns to</dt>
          <dd className="text-foreground-strong font-medium">{info.redirectHost}</dd>
        </div>
      </dl>
      {info.local ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          This app runs on your own computer. Only continue if you just started connecting it.
        </p>
      ) : null}
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" className="w-full" disabled={busy !== null} onClick={() => void answer("allow")}>
          {busy === "allow" ? <Loader2 className="size-4 animate-spin" /> : null}
          Allow
        </Button>
        <Button size="lg" variant="ghost" className="w-full" disabled={busy !== null} onClick={() => void answer("deny")}>
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">You can disconnect it any time in Settings → Connected apps.</p>
    </CliScreen>
  );
}
