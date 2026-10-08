"use client";

/**
 * Mobile WebView handoff. The native app opens
 *   /embed/enter?to=/n/<id>#at=<access>&rt=<refresh>
 * Tokens travel in the URL fragment, which browsers never send to servers.
 * We set the Supabase session (writing the auth cookies), drop the fragment
 * from history, and replace ourselves with the target route.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function EmbedEnter() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = safeNext(params.get("to")) ?? "/workspace";
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("at");
    const refresh_token = hash.get("rt");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!access_token || !refresh_token) {
      setError("Missing session.");
      return;
    }
    void createSupabaseBrowserClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: err }) => {
        if (err) setError(err.message);
        else router.replace(target);
      });
  }, [params, router]);

  return (
    <main className="text-muted-foreground grid h-svh place-items-center text-sm">
      {error ? `Couldn't open: ${error}` : "Opening…"}
    </main>
  );
}

export default function EmbedEnterPage() {
  return (
    <Suspense fallback={null}>
      <EmbedEnter />
    </Suspense>
  );
}
