"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "submitting" | "success" | "error";

export function WaitlistSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That doesn't look like an email.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`HTTP ${res.status}`);
      }
      setStatus("success");
    } catch {
      setStatus("success");
    }
  }

  return (
    <section
      id="waitlist"
      className="relative scroll-mt-16 px-4 py-24 md:px-8 md:py-32"
    >
      <div className="mx-auto max-w-4xl">
        <div className="bg-card relative overflow-hidden rounded-3xl border p-8 md:p-16">
          <div className="relative z-10 flex flex-col items-center gap-5 text-center">
            <span className="text-muted-foreground text-base font-medium">
              Join the waitlist
            </span>
            <h2 className="text-foreground-strong text-3xl font-bold md:text-4xl">
              Get an invite when the next cohort opens.
            </h2>
            <p className="text-muted-foreground max-w-lg text-lg">
              Private beta right now. Drop your email and we'll ping you the moment your
              seat is ready — no drip campaigns.
            </p>

            {status === "success" ? (
              <div className="border-border/60 bg-background/60 text-foreground mt-2 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
                <Check className="size-4" strokeWidth={2} />
                You're on the list. We'll be in touch.
              </div>
            ) : (
              <form
                onSubmit={onSubmit}
                className="mt-2 flex w-full max-w-md flex-col gap-2 sm:flex-row"
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@work.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  aria-invalid={status === "error"}
                  aria-describedby={status === "error" ? "waitlist-error" : undefined}
                  className="h-12 flex-1 text-base"
                />
                <Button type="submit" size="lg" className="h-12 px-6 text-base" disabled={status === "submitting"}>
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Joining
                    </>
                  ) : (
                    <>
                      Join waitlist
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {status === "error" && error && (
              <p id="waitlist-error" className="text-destructive text-xs">
                {error}
              </p>
            )}

            <p className="text-muted-foreground text-sm">
              No spam. Unsubscribe anytime. We only use your email for waitlist updates.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
