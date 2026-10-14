"use client";

/**
 * The admin portal's side of the sign-in handoff (see /workspace/admin-open):
 *   /admin-enter?to=/admin/users#th=<one-time token>
 * The token rides in the fragment, which browsers never send to servers. We
 * exchange it for this host's own session, drop it from history and go on.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { safeAdminPath } from "@/features/admin/portal-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function Enter() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const to = safeAdminPath(params.get("to"));
    const tokenHash = new URLSearchParams(window.location.hash.slice(1)).get("th");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!tokenHash) {
      router.replace(to);
      return;
    }
    void createSupabaseBrowserClient()
      .auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" })
      .then(({ error: err }) => {
        if (err) setError(err.message);
        else router.replace(to);
      });
  }, [params, router]);

  return (
    <main className="text-muted-foreground grid h-svh place-items-center text-sm">
      {error ? `Couldn't sign in to the admin portal: ${error}` : "Signing in…"}
    </main>
  );
}

export default function AdminEnterPage() {
  return (
    <Suspense>
      <Enter />
    </Suspense>
  );
}
