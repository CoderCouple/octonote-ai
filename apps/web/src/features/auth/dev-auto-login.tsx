"use client";

/**
 * DEVELOPMENT ONLY. Signs in as the local dev user so you skip the email
 * step on every visit. Active only when NODE_ENV is "development" AND
 * NEXT_PUBLIC_DEV_AUTO_LOGIN=true (see .env.example). Production builds
 * replace NODE_ENV statically, so this branch is dead code there.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const devLogin =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === "true"
    ? {
        email: process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? "",
        password: process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD ?? "",
      }
    : null;

export function DevAutoLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!devLogin) return;
    const next = safeNext(new URLSearchParams(window.location.search).get("next")) ?? "/workspace";
    void createSupabaseBrowserClient()
      .auth.signInWithPassword(devLogin)
      .then(({ error: err }) => {
        if (err) setError(`${err.message} — run: pnpm dev:user`);
        else router.replace(next);
      });
  }, [router]);

  if (!devLogin) return null;
  return (
    <div className="bg-popover fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-xs shadow-md">
      {error ? `Dev auto-login failed: ${error}` : "Dev mode: signing you in automatically…"}
    </div>
  );
}
