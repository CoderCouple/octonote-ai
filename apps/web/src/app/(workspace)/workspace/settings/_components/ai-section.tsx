"use client";

/**
 * Settings → AI: bring your own Anthropic key. With one, every AI feature
 * (Build with AI, Ask AI, the chat, explainer videos) runs on the person's
 * own key and has no hourly allowance. The key is checked with Anthropic,
 * stored encrypted, and never shown again: only its last four characters.
 */
import { ExternalLink, KeyRound, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientApi } from "@/lib/api/client-fetch";
import { Row, SectionShell } from "./settings-ui";

interface AiKeyStatus {
  available: boolean;
  provider: "anthropic" | null;
  last4: string | null;
  updatedAt: string | null;
}

export function AiSection() {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    clientApi
      .get<AiKeyStatus>("/me/ai-key")
      .then(setStatus)
      .catch(() =>
        setStatus({
          available: false,
          provider: null,
          last4: null,
          updatedAt: null,
        }),
      );
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const next = await clientApi.put<AiKeyStatus>("/me/ai-key", { key });
      setStatus(next);
      setKey("");
      toast.success("Your key is saved. AI now runs on it.");
    } catch (e) {
      toast.error((e as Error).message || "Couldn't save the key.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await clientApi.delete("/me/ai-key");
    setStatus((s) =>
      s ? { ...s, provider: null, last4: null, updatedAt: null } : s,
    );
    setRemoving(false);
    toast.success("Removed. AI uses Octonote's key again.");
  };

  return (
    <SectionShell
      id="ai"
      icon={Sparkles}
      title="AI"
      description="Use your own Anthropic API key for Octonote's AI features."
    >
      <Row
        label="Your Anthropic key"
        description={
          <>
            With your own key, Build with AI, Ask AI, the chat and explainer
            videos run on your Anthropic account, with no hourly limit.{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
            >
              Get a key <ExternalLink className="size-3" />
            </a>
          </>
        }
      >
        {status === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : !status.available ? (
          <p className="text-muted-foreground text-sm">
            Not available on this server yet.
          </p>
        ) : status.last4 ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm">
              <KeyRound className="text-muted-foreground size-4" />
              <code className="bg-muted rounded px-1.5 py-0.5">
                sk-ant-…{status.last4}
              </code>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoving(true)}
            >
              Remove
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim()) void save();
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save key
            </Button>
          </form>
        )}
      </Row>
      <Row label="How it's kept" description="So you know what happens to it.">
        <p className="text-muted-foreground text-sm">
          The key is checked with Anthropic, then stored encrypted. It's only
          used for your own AI requests, never shown again (just its last four
          characters), and you can remove it at any time.
        </p>
      </Row>
      <ConfirmActionDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove your Anthropic key?"
        description="AI features go back to Octonote's key and its hourly limit."
        actionLabel="Remove key"
        onConfirm={remove}
      />
    </SectionShell>
  );
}
