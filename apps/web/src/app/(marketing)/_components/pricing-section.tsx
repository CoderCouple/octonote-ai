"use client";

/**
 * Public pricing: Free and Pro side by side, a monthly/yearly switch, and the
 * student offer. Numbers come from @octonote/shared so the page can't drift
 * from what the API enforces.
 */
import {
  FREE_LIMIT,
  PRO_PRICE,
  STUDENT_PRO_MONTHS,
  type BillingInterval,
} from "@octonote/shared";
import { Check, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The cards list only what differs between plans; the rest is shared. */
const FREE_FEATURES = [
  `${FREE_LIMIT} notes, ${FREE_LIMIT} canvases, ${FREE_LIMIT} projects and ${FREE_LIMIT} notebooks`,
  "One workspace",
];

const PRO_FEATURES = [
  "Unlimited notes, canvases, projects and notebooks",
  "Unlimited workspaces",
];

const EVERY_PLAN = [
  "Notes with math, Mermaid and code",
  "Infinite canvases and projects",
  "Sharing and publishing to the web",
  "View analytics for published pages",
  "CLI for Claude Code and Codex",
  "Web, desktop and phone browsers",
];

export function PricingSection() {
  const [interval, setInterval] = useState<BillingInterval>("year");
  // Phones show one plan at a time; desktop shows both side by side.
  const [plan, setPlan] = useState<"free" | "pro">("pro");
  const saving = PRO_PRICE.month * 12 - PRO_PRICE.year;

  return (
    <section
      id="pricing"
      className="relative scroll-mt-16 border-t px-4 py-16 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-muted-foreground text-base font-medium md:text-lg">
          Pricing
        </p>
        <h2 className="text-foreground-strong mt-3 text-4xl leading-[1.1] font-bold text-balance md:text-5xl lg:text-6xl">
          Start free. <br className="max-md:hidden" />
          Upgrade when you need more.
        </h2>
        <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg md:text-xl">
          Every feature is in the free plan. Pro removes the limits.
        </p>

        <div
          role="radiogroup"
          aria-label="Plan"
          className="bg-muted mx-auto mt-8 grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg p-1 md:hidden"
        >
          {(["free", "pro"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={plan === p}
              onClick={() => setPlan(p)}
              className={cn(
                "rounded-md px-5 py-2 text-sm font-semibold transition-colors",
                plan === p
                  ? "bg-background text-foreground-strong shadow-sm"
                  : "text-muted-foreground hover:text-foreground-strong",
              )}
            >
              {p === "free" ? "Free" : "Pro"}
            </button>
          ))}
        </div>

        <div
          role="radiogroup"
          aria-label="Billing period"
          className={cn(
            "bg-muted mx-auto mt-3 grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg p-1 md:mt-10 md:inline-grid md:w-auto md:max-w-none",
            plan === "free" && "max-md:hidden",
          )}
        >
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap transition-colors md:px-5",
                interval === i
                  ? "bg-background text-foreground-strong shadow-sm"
                  : "text-muted-foreground hover:text-foreground-strong",
              )}
            >
              {i === "month" ? "Monthly" : `Yearly · save $${saving}`}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:mt-12 md:grid-cols-2 md:gap-6">
        <Plan
          className={cn(plan !== "free" && "max-md:hidden")}
          name="Free"
          price="$0"
          per="forever"
          blurb="For trying it out and personal notes."
          features={FREE_FEATURES}
          cta={
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/signup">Get started</Link>
            </Button>
          }
          footnote="No credit card needed."
        />
        <Plan
          className={cn(plan !== "pro" && "max-md:hidden")}
          highlight
          name="Pro"
          price={`$${PRO_PRICE[interval]}`}
          per={
            interval === "month"
              ? "per month, per workspace"
              : `per year, per workspace ($${(PRO_PRICE.year / 12).toFixed(2)}/month)`
          }
          blurb="For people who live in their notes."
          features={PRO_FEATURES}
          cta={
            <Button asChild size="lg" className="w-full">
              <Link href="/signup">Start with Pro</Link>
            </Button>
          }
          footnote="Sign up, then upgrade from Plan & billing. Cancel any time."
        />
      </div>

      <div className="mx-auto mt-4 max-w-5xl rounded-2xl border p-5 md:mt-6 md:p-8">
        <h3 className="text-foreground-strong text-base font-semibold md:text-lg">
          Every plan includes
        </h3>
        <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {EVERY_PLAN.map((f) => (
            <li
              key={f}
              className="flex items-start gap-2.5 text-sm md:text-base"
            >
              <Check className="text-foreground-strong mt-0.5 size-4 shrink-0 md:size-5" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-4 flex max-w-5xl flex-col items-start gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center md:mt-6 md:p-8">
        <span className="bg-foreground-strong text-background grid size-10 shrink-0 place-items-center rounded-xl max-sm:hidden md:size-12">
          <GraduationCap className="size-5 md:size-6" />
        </span>
        <div className="flex-1">
          <h3 className="text-foreground-strong text-lg font-semibold md:text-xl">
            Students get Pro free for{" "}
            {STUDENT_PRO_MONTHS === 12
              ? "a year"
              : `${STUDENT_PRO_MONTHS} months`}
            .
          </h3>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Sign up with your school email address (like{" "}
            <span className="text-foreground">.edu</span>) and Pro is switched
            on automatically. No card needed.
          </p>
        </div>
        <Button asChild variant="outline" size="lg">
          <Link href="/signup">Sign up as a student</Link>
        </Button>
      </div>
    </section>
  );
}

function Plan({
  name,
  price,
  per,
  blurb,
  features,
  cta,
  footnote,
  highlight,
  className,
}: {
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
  cta: React.ReactNode;
  footnote?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-2xl border p-5 text-left md:p-8",
        highlight && "border-foreground-strong border-2",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-foreground-strong text-xl font-semibold md:text-2xl">
          {name}
        </h3>
        {highlight ? (
          <span className="bg-foreground-strong text-background rounded-full px-3 py-1 text-xs font-semibold">
            Unlimited
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm md:mt-2 md:text-base">
        {blurb}
      </p>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 md:mt-6">
        <span className="text-foreground-strong text-4xl font-bold tracking-tight md:text-5xl">
          {price}
        </span>
        <span className="text-muted-foreground text-sm">{per}</span>
      </div>
      <ul className="mt-4 flex-1 space-y-2.5 md:mt-6 md:space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm md:text-base">
            <Check className="text-foreground-strong mt-0.5 size-5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-5 md:mt-8">{cta}</div>
      {footnote ? (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
