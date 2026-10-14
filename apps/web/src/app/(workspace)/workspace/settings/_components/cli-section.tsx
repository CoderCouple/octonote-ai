"use client";

/**
 * Settings → CLI & agents: how to install the `octonote` CLI, the tokens
 * it (and agents like Claude Code / Codex) use, and a way to create one for
 * CI or cloud agents — shown once, then only as "ont_…abcd".
 */
import { KeyRound, Loader2, Terminal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { clientApi } from "@/lib/api/client-fetch";
import { CopyButton, Row, SectionShell } from "./settings-ui";

interface CliToken {
  id: string;
  name: string;
  preview: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// Served from octonote.ai (scripts/pack-cli.mjs) until it is on the npm registry.
const INSTALL = "npm i -g https://octonote.ai/cli/octonote-cli.tgz && octonote";

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CliSection() {
  const [tokens, setTokens] = useState<CliToken[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<CliToken | null>(null);

  const load = () =>
    clientApi
      .get<CliToken[]>("/me/cli-tokens")
      .then(setTokens)
      .catch(() => setTokens([]));
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await clientApi.post<{ plaintext: string }>(
        "/me/cli-tokens",
        {
          name: name.trim() || "Agent",
        },
      );
      setCreated(res.plaintext);
      setName("");
      void load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't create a token.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: CliToken) {
    try {
      await clientApi.delete(`/me/cli-tokens/${token.id}`);
      toast.success(`Revoked “${token.name}”.`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke.");
    }
  }

  return (
    <SectionShell
      id="cli"
      icon={Terminal}
      title="CLI & agents"
      description="Let Claude Code, Codex or your scripts write notes and canvases with the octonote command-line tool."
    >
      <Row
        label="Install"
        description="Then run `octonote setup claude` or `octonote setup codex` in a project so your agent knows how to use it."
      >
        <div className="flex items-center gap-2">
          <Input value={INSTALL} readOnly className="font-mono text-xs" />
          <CopyButton value={INSTALL} />
        </div>
        <a
          href="/cli"
          target="_blank"
          rel="noreferrer"
          className="text-foreground-strong mt-2 inline-block text-xs font-medium underline underline-offset-4"
        >
          Full guide: commands, Claude Code &amp; Codex setup →
        </a>
      </Row>
      <Row
        label="Tokens"
        description="Each signed-in computer or agent has one. Revoke any you don't recognise."
      >
        {tokens === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tokens yet. `octonote login` creates one.
          </p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <KeyRound className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-medium">
                    {t.name}
                  </div>
                  <div className="text-muted-foreground truncate font-mono text-xs">
                    {t.preview} · last used {when(t.lastUsedAt).toLowerCase()}
                    {t.expiresAt ? ` · expires ${when(t.expiresAt)}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:text-destructive gap-1.5"
                  onClick={() => setRevoking(t)}
                >
                  <Trash2 className="size-3.5" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <Row
        label="Token for CI or a cloud agent"
        description="Set it as OCTONOTE_TOKEN where there's no browser to sign in."
      >
        <Button variant="outline" onClick={() => setCreating(true)}>
          <KeyRound className="size-4" />
          Create token
        </Button>
      </Row>

      <Dialog
        open={creating}
        onOpenChange={(o) => {
          setCreating(o);
          if (!o) setCreated(null);
        }}
      >
        <DialogContent>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Copy your token now</DialogTitle>
                <DialogDescription>
                  It won&apos;t be shown again. Anyone with it can edit your
                  notes and canvases — keep it in a secret store, not in code.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Input value={created} readOnly className="font-mono text-xs" />
                <CopyButton value={created} />
              </div>
              <DialogFooter>
                <Button onClick={() => setCreating(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create a token</DialogTitle>
                <DialogDescription>
                  Name it after where it'll be used, like “GitHub Actions”.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GitHub Actions"
                maxLength={80}
                aria-label="Token name"
                disabled={busy}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreating(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button onClick={create} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name ?? ""}”?`}
        description="Anything using this token stops working right away."
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
      />
    </SectionShell>
  );
}
