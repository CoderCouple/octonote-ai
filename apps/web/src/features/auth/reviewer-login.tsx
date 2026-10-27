"use client";

/**
 * App-directory reviewers (Anthropic, OpenAI) need an account they can sign
 * into instantly — no email code, no 2FA. This email + password form only
 * works for accounts that have a password, and only the reviewer account
 * does (everyone else signs in with a code, Google or Apple). Shown while
 * NEXT_PUBLIC_REVIEWER_LOGIN=true; switch it off once the listings are approved.
 */
import { KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const enabled = process.env.NEXT_PUBLIC_REVIEWER_LOGIN === "true";

export function ReviewerLogin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground mx-auto mt-6 block text-xs underline-offset-4 hover:underline"
      >
        App reviewer? Sign in with a password
      </button>
    );
  }

  return (
    <form
      className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-2 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void createSupabaseBrowserClient()
          .auth.signInWithPassword({ email: email.trim(), password })
          .then(({ error: err }) => {
            if (err) {
              setBusy(false);
              setError("That email and password don't match a reviewer account.");
            } else {
              router.replace(safeNext(new URLSearchParams(window.location.search).get("next")) ?? "/workspace");
            }
          });
      }}
    >
      <p className="text-foreground-strong flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4" /> Reviewer sign-in
      </p>
      <Input type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
