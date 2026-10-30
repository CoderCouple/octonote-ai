"use client";

/**
 * The admin portal opens a support session here:
 *   /support-enter#t=<ons_… token>&exp=<ISO time>
 * The token rides the fragment (never sent to servers), becomes the
 * short-lived support cookie, and the tab opens the person's home.
 */
import { SUPPORT_TOKEN_PREFIX } from "@octonote/shared";
import { useEffect, useState } from "react";
import { setSupportToken } from "@/lib/support-session";

export default function SupportEnterPage() {
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("t");
    const exp = new Date(params.get("exp") ?? "");
    history.replaceState(null, "", window.location.pathname);
    if (!token?.startsWith(SUPPORT_TOKEN_PREFIX) || Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) {
      setError(true);
      return;
    }
    setSupportToken(token, exp);
    window.location.replace("/workspace/home");
  }, []);

  return (
    <main className="text-muted-foreground grid min-h-screen place-items-center p-8 text-sm">
      {error ? "This support link is invalid or has expired. Start a new session from the admin portal." : "Opening the account…"}
    </main>
  );
}
