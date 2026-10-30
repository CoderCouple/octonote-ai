"use client";

/**
 * Admin → a person → Piggyback: open their account read-only in a new
 * tab on the main site. Inside their grant it just needs a reason; without
 * one it's an emergency override (reason audited, shown in their Settings). Past sessions
 * below, with how many requests each made.
 */
import type { AdminSupportStatus, SupportSessionStarted } from "@octonote/shared";
import { Eye, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/api/client-fetch";
import { mainHostFor } from "../portal-url";
import { errorText, fmtDateTime, Panel } from "./ui";

export function SupportPanel({ userId, email }: { userId: string; email: string }) {
  const [status, setStatus] = useState<AdminSupportStatus | null>(null);
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    clientApi
      .get<AdminSupportStatus>(`/admin/support/users/${userId}`)
      .then(setStatus)
      .catch((e) => toast.error(errorText(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per person
  }, [userId]);

  const granted = Boolean(status?.grantedUntil);
  const canStart = reason.trim().length >= 10 && (granted || override) && !busy;

  async function start() {
    // Opened now (inside the click) so pop-up blockers allow it; filled in below.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const s = await clientApi.post<SupportSessionStarted>("/admin/support/sessions", {
        userId,
        reason: reason.trim(),
        override: !granted && override,
      });
      const { protocol, host } = window.location;
      const url = `${protocol}//${mainHostFor(host)}/support-enter#t=${encodeURIComponent(s.token)}&exp=${encodeURIComponent(s.expiresAt)}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setReason("");
      setOverride(false);
      await load();
    } catch (e) {
      tab?.close();
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function end(id: string) {
    try {
      await clientApi.post(`/admin/support/sessions/${id}/end`);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  const live = (s: AdminSupportStatus["sessions"][number]) => !s.endedAt && new Date(s.expiresAt) > new Date();

  return (
    <Panel title="Piggyback">
      {!status ? (
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            {granted
              ? `${email} allows support access until ${fmtDateTime(status.grantedUntil!)}.`
              : `${email} hasn't allowed support access. Ask them to turn on "Support access" in Settings → Privacy.`}{" "}
            <span className="text-muted-foreground">Piggybacking is read-only and lasts 30 minutes.</span>
          </p>
          <div className="space-y-2">
            <Label htmlFor="support-reason">Reason (saved in the audit log)</Label>
            <Textarea
              id="support-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Their canvas won't open after the 28 Oct update (ticket from hello@)"
              rows={2}
              maxLength={500}
            />
            {!granted ? (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} className="mt-0.5" />
                <span>
                  <strong>Emergency override.</strong> Piggyback without their permission. Your reason is saved in the audit log.
                </span>
              </label>
            ) : null}
            <Button onClick={start} disabled={!canStart} variant={granted ? "default" : "destructive"}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              Piggyback (read-only)
            </Button>
          </div>
          {status.sessions.length ? (
            <ul className="divide-y text-sm">
              {status.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div>
                      {fmtDateTime(s.startedAt)} · {s.adminEmail}
                      {s.via === "override" ? " · override" : ""} · {s.requests} request{s.requests === 1 ? "" : "s"}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{s.reason}</div>
                  </div>
                  {live(s) ? (
                    <Button size="sm" variant="outline" onClick={() => end(s.id)}>
                      End now
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
