"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { AuthBackdrop } from "./auth-backdrop";

type Status =
  | { kind: "idle" }
  | { kind: "sending-email" }
  | { kind: "sending-oauth" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

interface LoginFormProps extends React.ComponentProps<"div"> {
  mode?: "login" | "signup";
}

const COPY = {
  login: {
    title: "Welcome back",
    description: "Login to your Octonote account",
    primary: "Send magic link",
    google: "Continue with Google",
    altPrompt: "Don't have an account?",
    altLabel: "Sign up",
    altHref: "/signup",
  },
  signup: {
    title: "Create your account",
    description: "Start with Octonote in seconds",
    primary: "Send magic link",
    google: "Sign up with Google",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
    altHref: "/login",
  },
} as const;

/** Callback URL that brings the user back to where they started (e.g. a shared note). */
function callbackUrl(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return `${window.location.origin}/auth/callback${query}`;
}

export function LoginForm({ className, mode = "login", ...props }: LoginFormProps) {
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const isBusy = status.kind === "sending-email" || status.kind === "sending-oauth";

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;
    setStatus({ kind: "sending-email" });
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({ kind: "sent", email });
  }

  async function onGoogleClick() {
    setStatus({ kind: "sending-oauth" });
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setStatus({ kind: "error", message: error.message });
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={onEmailSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">
                  {status.kind === "sent" ? "Check your inbox" : copy.title}
                </h1>
                <p className="text-muted-foreground text-balance">
                  {status.kind === "sent" ? (
                    <>
                      We sent a magic link to <strong>{status.email}</strong>. Open it on this
                      device to continue.
                    </>
                  ) : (
                    copy.description
                  )}
                </p>
              </div>
              {status.kind !== "sent" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={isBusy}
                      suppressHydrationWarning
                    />
                  </Field>
                  <Field>
                    <Button type="submit" disabled={isBusy || !email}>
                      {status.kind === "sending-email" ? "Sending…" : copy.primary}
                    </Button>
                    {status.kind === "error" && (
                      <p className="text-destructive text-center text-xs">{status.message}</p>
                    )}
                  </Field>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    Or continue with
                  </FieldSeparator>
                  <Field>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={onGoogleClick}
                      disabled={isBusy}
                    >
                      <svg
                        className="h-4 w-4 shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                      </svg>
                      {status.kind === "sending-oauth" ? "Redirecting…" : copy.google}
                    </Button>
                  </Field>
                  <FieldDescription className="text-center">
                    {copy.altPrompt}{" "}
                    <Link href={copy.altHref} className="underline underline-offset-4">
                      {copy.altLabel}
                    </Link>
                  </FieldDescription>
                </>
              )}
            </FieldGroup>
          </form>
          <div className="border-border relative hidden overflow-hidden md:block md:border-l">
            <AuthBackdrop
              orbTop="50%"
              orbSize={160}
              showStars={false}
              showShootingStars={false}
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center text-xs">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </FieldDescription>
    </div>
  );
}
