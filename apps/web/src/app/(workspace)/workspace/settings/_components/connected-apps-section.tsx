"use client";

/**
 * Settings → Connected apps: assistant apps (Claude, ChatGPT, Gemini…) you
 * allowed to use Octonote through the MCP server. Disconnecting ends the
 * app's access at once.
 */
import { Bot, Loader2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientApi } from "@/lib/api/client-fetch";
import { CopyButton, Row, SectionShell } from "./settings-ui";

interface ConnectedApp {
  id: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const MCP_URL = `${(process.env.NEXT_PUBLIC_API_URL ?? "https://api.octonote.ai").replace(/\/$/, "")}/mcp`;

function when(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ConnectedAppsSection() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [removing, setRemoving] = useState<ConnectedApp | null>(null);

  useEffect(() => {
    clientApi
      .get<ConnectedApp[]>("/me/connected-apps")
      .then(setApps)
      .catch(() => setApps([]));
  }, []);

  return (
    <SectionShell
      id="connected-apps"
      icon={Bot}
      title="Connected apps"
      description="Use Octonote from Claude, ChatGPT and other assistants. They sign in with your Octonote account."
    >
      <Row
        label="Connector URL"
        description="In Claude: Settings → Connectors → Add custom connector. In ChatGPT: Settings → Apps → Create. Paste this URL."
      >
        <div className="flex items-center gap-2">
          <Input value={MCP_URL} readOnly className="font-mono text-xs" />
          <CopyButton value={MCP_URL} />
        </div>
      </Row>
      <Row label="Apps with access" description="Disconnect any you don't use or don't recognise.">
        {apps === null ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No apps connected yet.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <Bot className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-medium">{a.clientName}</div>
                  <div className="text-muted-foreground text-xs">
                    Connected {when(a.createdAt)} · last used {when(a.lastUsedAt)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="hover:text-destructive gap-1.5" onClick={() => setRemoving(a)}>
                  <Unplug className="size-3.5" />
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Row>
      <ConfirmActionDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Disconnect ${removing?.clientName ?? "this app"}?`}
        description="It loses access right away. You can connect it again later."
        actionLabel="Disconnect"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await clientApi.delete(`/me/connected-apps/${removing.id}`);
            setApps((list) => list?.filter((x) => x.id !== removing.id) ?? null);
            toast.success(`${removing.clientName} disconnected`);
          } catch {
            toast.error("Couldn't disconnect. Try again.");
          } finally {
            setRemoving(null);
          }
        }}
      />
    </SectionShell>
  );
}
