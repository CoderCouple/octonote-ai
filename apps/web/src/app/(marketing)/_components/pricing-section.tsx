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

const FREE_FEATURES = [
  `${FREE_LIMIT} notes, ${FREE_LIMIT} canvases, ${FREE_LIMIT} projects and ${FREE_LIMIT} notebooks`,
  "One workspace",
  "Sharing, links and publishing to the web",
  "View analytics for published pages",
  "Math and diagrams in notes",
  "Web, iPhone and Android",
];

const PRO_FEATURES = [
  "Unlimited notes, canvases, projects and notebooks",
  "Unlimited workspaces",
  "Everything in Free",
];

export function PricingSection() {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const saving = PRO_PRICE.month * 12 - PRO_PRICE.year;

  return (
    <section
      id="pricing"
      className="relative scroll-mt-16 border-t px-4 py-28 md:px-8 md:py-40"
    >
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-muted-foreground text-lg font-medium md:text-xl">
          Pricing
        </p>
        <h2 className="text-foreground-strong md:text-display mt-5 text-4xl font-bold">
          Start free. Upgrade when you need more.
        </h2>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-xl">
          Every feature is in the free plan. Pro removes the limits.
        </p>

        <div
          role="radiogroup"
          aria-label="Billing period"
          className="bg-muted mx-auto mt-10 inline-grid grid-cols-2 gap-1 rounded-lg p-1"
        >
          {(["month", "year"] as const).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-md px-5 py-2 text-sm font-medium transition-colors",
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

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
        <Plan
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
        />
        <Plan
          highlight
          name="Pro"
          price={`$${PRO_PRICE[interval]}`}
          per={
            interval === "month"
              ? "per month, per workspace"
              : "per year, per workspace"
          }
          blurb="For people and teams who live in their notes."
          features={PRO_FEATURES}
          cta={
            <Button asChild size="lg" className="w-full">
              <Link href="/signup">Start with Pro</Link>
            </Button>
          }
          footnote="Sign up, then upgrade from Plan & billing. Cancel any time."
        />
      </div>

      <div className="mx-auto mt-6 flex max-w-5xl flex-col items-start gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center md:p-8">
        <span className="bg-foreground-strong text-background grid size-12 shrink-0 place-items-center rounded-xl">
          <GraduationCap className="size-6" />
        </span>
        <div className="flex-1">
          <h3 className="text-foreground-strong text-xl font-semibold">
            Students get Pro free for{" "}
            {STUDENT_PRO_MONTHS === 12
              ? "a year"
              : `${STUDENT_PRO_MONTHS} months`}
            .
          </h3>
          <p className="text-muted-foreground mt-1 text-base">
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
}: {
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
  cta: React.ReactNode;
  footnote?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-2xl border p-6 text-left md:p-8",
        highlight && "border-foreground-strong border-2",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-foreground-strong text-2xl font-semibold">
          {name}
        </h3>
        {highlight ? (
          <span className="bg-foreground-strong text-background rounded-full px-3 py-1 text-xs font-semibold">
            Unlimited
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-2 text-base">{blurb}</p>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-foreground-strong text-5xl font-bold tracking-tight">
          {price}
        </span>
        <span className="text-muted-foreground text-sm">{per}</span>
      </div>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-base">
            <Check className="text-foreground-strong mt-0.5 size-5 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
      {footnote ? (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
