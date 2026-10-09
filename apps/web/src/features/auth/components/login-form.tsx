"use client";

/**
 * Sign in / sign up, matching the mobile app: logo tile, "Welcome to
 * Octonote AI.", Google or email. Email sends one message carrying both a
 * magic link and a 6-digit code — the user can click the link or type the
 * code here (handy when the mail is on another device).
 */
import { ArrowLeft, Focus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

type Step = { kind: "email" } | { kind: "code"; email: string };

const COPY = {
  login: {
    subtitle: "Sign in with Google or your email.",
    google: "Continue with Google",
    altPrompt: "New to Octonote AI?",
    altLabel: "Create an account",
    altHref: "/signup",
  },
  signup: {
    subtitle: "Create your free account in seconds. No password needed.",
    google: "Sign up with Google",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
    altHref: "/login",
  },
} as const;

const RESEND_SECONDS = 30;

function nextPath(): string {
  return (
    safeNext(new URLSearchParams(window.location.search).get("next")) ??
    "/workspace"
  );
}

/** Callback URL that brings the user back to where they started (e.g. a shared note). */
function callbackUrl(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return `${window.location.origin}/auth/callback${query}`;
}

const field =
  "border-input bg-background placeholder:text-foreground-subtle focus-visible:border-foreground-strong h-12 w-full rounded-xl border px-4 text-base outline-none transition-colors disabled:opacity-50";

export function LoginForm({ mode = "login" }: { mode?: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("error") === "callback"
    ) {
      setError(
        "That sign-in link has expired or was already used. Send a new one.",
      );
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendEmail(address: string) {
    const supabase = createSupabaseBrowserClient();
    return supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl() },
    });
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy("email");
    setError(null);
    const { error: err } = await sendEmail(address);
    setBusy(null);
    if (err) return setError(err.message);
    setEmail(address);
    setCode("");
    setNotice(null);
    setCooldown(RESEND_SECONDS);
    setStep({ kind: "code", email: address });
    requestAnimationFrame(() => codeRef.current?.focus());
  }

  async function onGoogle() {
    setBusy("google");
    setError(null);
    const { error: err } =
      await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
    if (err) {
      setBusy(null);
      setError(err.message);
    }
  }

  async function verify(token: string) {
    if (step.kind !== "code" || token.length !== 6) return;
    setBusy("code");
    setError(null);
    const { error: err } = await createSupabaseBrowserClient().auth.verifyOtp({
      email: step.email,
      token,
      type: "email",
    });
    if (err) {
      setBusy(null);
      setCode("");
      setError(
        err.message.toLowerCase().includes("expired")
          ? "That code has expired. Send a new one."
          : "That code isn't right. Try again.",
      );
      codeRef.current?.focus();
      return;
    }
    router.replace(nextPath());
    router.refresh();
  }

  async function resend() {
    if (step.kind !== "code" || cooldown > 0) return;
    setError(null);
    const { error: err } = await sendEmail(step.email);
    if (err) return setError(err.message);
    setNotice("New code sent.");
    setCooldown(RESEND_SECONDS);
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-2xl">
        <Focus className="size-7" strokeWidth={2.25} />
      </div>

      {step.kind === "email" ? (
        <>
          <h1 className="text-foreground-strong mt-8 text-4xl leading-[1.1] font-bold tracking-tight md:text-5xl">
            Welcome to
            <br />
            Octonote AI.
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">{copy.subtitle}</p>

          <div className="mt-10 space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={onGoogle}
              disabled={busy !== null}
              className="h-12 w-full gap-3 rounded-xl text-base"
            >
              {busy === "google" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              {busy === "google" ? "Redirecting…" : copy.google}
            </Button>

            <div className="text-foreground-subtle flex items-center gap-4 text-sm">
              <span className="bg-border h-px flex-1" />
              or
              <span className="bg-border h-px flex-1" />
            </div>

            <form onSubmit={onEmailSubmit} className="space-y-3" noValidate>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                disabled={busy !== null}
                className={field}
                suppressHydrationWarning
              />
              <Button
                type="submit"
                disabled={busy !== null || !email}
                className="h-12 w-full rounded-xl text-base"
              >
                {busy === "email" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {busy === "email" ? "Sending…" : "Continue with email"}
              </Button>
            </form>
          </div>

          <Message error={error} />

          <p className="text-muted-foreground mt-10 text-sm">
            {copy.altPrompt}{" "}
            <Link
              href={copy.altHref}
              className="text-foreground-strong font-medium underline-offset-4 hover:underline"
            >
              {copy.altLabel}
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="text-foreground-strong mt-8 text-4xl leading-[1.1] font-bold tracking-tight md:text-5xl">
            Check your
            <br />
            email.
          </h1>
          <p className="text-muted-foreground mt-3 text-lg">
            We sent a sign-in link and a 6-digit code to{" "}
            <span className="text-foreground-strong font-medium">
              {step.email}
            </span>
            . Click the link, or enter the code here.
          </p>

          <form
            className="mt-10 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void verify(code);
            }}
          >
            <label htmlFor="code" className="sr-only">
              6-digit code
            </label>
            <input
              ref={codeRef}
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                setError(null);
                if (digits.length === 6) void verify(digits);
              }}
              disabled={busy === "code"}
              className={cn(
                field,
                "h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums",
              )}
            />
            <Button
              type="submit"
              disabled={busy === "code" || code.length !== 6}
              className="h-12 w-full rounded-xl text-base"
            >
              {busy === "code" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {busy === "code" ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <Message error={error} notice={notice} />

          <div className="mt-8 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep({ kind: "email" });
                setError(null);
                setNotice(null);
              }}
              className="text-muted-foreground hover:text-foreground-strong inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Use a different email
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={cooldown > 0}
              className="text-foreground-strong font-medium underline-offset-4 hover:underline disabled:text-foreground-subtle disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
            </button>
          </div>
        </>
      )}

      <p className="text-foreground-subtle mt-12 text-xs leading-relaxed">
        By continuing, you agree to our{" "}
        <Link
          href="/terms"
          className="hover:text-foreground underline underline-offset-4"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="hover:text-foreground underline underline-offset-4"
        >
          Privacy Notice
        </Link>
        .
      </p>
    </div>
  );
}

function Message({
  error,
  notice,
}: {
  error: string | null;
  notice?: string | null;
}) {
  if (!error && !notice) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "mt-4 text-sm",
        error ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {error ?? notice}
    </p>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}
