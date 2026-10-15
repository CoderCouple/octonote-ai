"use client";

/**
 * Sign in / sign up, matching the mobile app: logo tile, "Welcome to
 * Octonote AI.", Google / Apple / Microsoft or email. Email sends one message carrying both a
 * magic link and a 6-digit code — the user can click the link or type the
 * code here (handy when the mail is on another device).
 */
import { ArrowLeft, Focus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { BRAND_MARKS } from "@octonote/shared";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import type { OAuthProvider } from "../lib/enabled-providers";

type Mode = "login" | "signup";

type Step = { kind: "email" } | { kind: "code"; email: string };

const COPY = {
  login: {
    subtitle: "Sign in to pick up where you left off.",
    oauthVerb: "Continue with",
    altPrompt: "New to Octonote AI?",
    altLabel: "Create an account",
    altHref: "/signup",
  },
  signup: {
    subtitle: "Create your free account in seconds. No password needed.",
    oauthVerb: "Sign up with",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
    altHref: "/login",
  },
} as const;

const RESEND_SECONDS = 30;

const OAUTH: { id: OAuthProvider; label: string; scopes?: string }[] = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  // Entra only returns the email address when asked for the "email" scope.
  { id: "azure", label: "Microsoft", scopes: "email" },
];

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

export function LoginForm({
  mode = "login",
  providers = [],
}: {
  mode?: Mode;
  /** Social sign-ins switched on in Supabase (see getEnabledProviders). */
  providers?: OAuthProvider[];
}) {
  const copy = COPY[mode];
  const oauth = OAUTH.filter((p) => providers.includes(p.id));
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"email" | OAuthProvider | "code" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // /auth/callback sends failed or cancelled Google / Apple / Microsoft sign-ins here.
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get("error") === "callback"
    ) {
      setError(
        "Sign-in didn't finish. Try again, or continue with your email.",
      );
    }
  }, []);
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

  async function onOAuth(provider: (typeof OAUTH)[number]) {
    setBusy(provider.id);
    setError(null);
    const { error: err } =
      await createSupabaseBrowserClient().auth.signInWithOAuth({
        provider: provider.id,
        options: { redirectTo: callbackUrl(), scopes: provider.scopes },
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
            {oauth.length > 0 && (
              <>
                <div className="space-y-2.5">
                  {oauth.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      onClick={() => onOAuth(p)}
                      disabled={busy !== null}
                      className="h-12 w-full gap-3 rounded-xl text-base"
                    >
                      {busy === p.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <BrandIcon provider={p.id} />
                      )}
                      {busy === p.id
                        ? "Redirecting…"
                        : `${copy.oauthVerb} ${p.label}`}
                    </Button>
                  ))}
                </div>

                <div className="text-foreground-subtle flex items-center gap-4 text-sm">
                  <span className="bg-border h-px flex-1" />
                  or
                  <span className="bg-border h-px flex-1" />
                </div>
              </>
            )}

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

/** A provider's logo from the shared brand marks (colour where the brand has it). */
function BrandIcon({ provider }: { provider: OAuthProvider }) {
  const mark = BRAND_MARKS[provider];
  return (
    <svg
      className="size-4 shrink-0"
      viewBox={mark.viewBox}
      fill="currentColor"
      aria-hidden="true"
    >
      {mark.paths.map((p) => (
        <path key={p.d} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}
