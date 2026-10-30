"use client";

/**
 * While staff piggyback on someone's account (a support session), a red bar floats
 * over every page: whose account, read-only, time left, and Exit. When the
 * session ends or expires, the token is dropped and the tab leaves.
 */
import type { SupportSessionInfo } from "@octonote/shared";
import { useEffect, useState } from "react";
import { clientApi } from "@/lib/api/client-fetch";
import { clearSupportToken, readSupportToken } from "@/lib/support-session";

function leave() {
  clearSupportToken();
  window.close();
  // Tabs the script didn't open can't close themselves.
  window.location.replace("/");
}

export function SupportBanner() {
  const [info, setInfo] = useState<SupportSessionInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!readSupportToken()) return;
    clientApi
      .get<SupportSessionInfo>("/support-session")
      .then(setInfo)
      .catch(leave);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const msLeft = info ? new Date(info.expiresAt).getTime() - now : 1;
  useEffect(() => {
    if (info && msLeft <= 0) leave();
  }, [info, msLeft]);

  if (!info) return null;

  async function exit() {
    await clientApi.delete("/support-session").catch(() => undefined);
    leave();
  }

  return (
    <div
      role="status"
      className="bg-destructive text-destructive-foreground fixed bottom-4 left-1/2 z-[1000] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg"
    >
      <span className="truncate">
        <strong>Piggybacking</strong> · {info.userName || info.userEmail} ({info.userEmail}) · read-only ·{" "}
        {Math.max(1, Math.ceil(msLeft / 60_000))} min left
      </span>
      <button
        type="button"
        onClick={exit}
        className="shrink-0 rounded-full bg-black/20 px-3 py-1 font-medium hover:bg-black/30"
      >
        Exit
      </button>
    </div>
  );
}
