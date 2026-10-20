import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { signupHref } from "../lib/signup-ref";

/**
 * The end-of-page invitation on every published note, project and notebook:
 * readers who liked the page are the people most likely to want their own.
 * The sign-up link carries where they came from (see signup-ref.ts).
 */
export function MadeWithCta({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  return (
    <section
      aria-label="Make your own"
      className={
        "bg-muted flex flex-col gap-5 rounded-2xl p-6 md:flex-row md:items-center md:justify-between md:p-7 " +
        (className ?? "")
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-foreground-strong text-xl font-bold tracking-tight">
          Make a page like this. Free.
        </span>
        <span className="text-muted-foreground text-sm md:text-[15px]">
          Notes and diagrams side by side, written by you or by Claude Code and
          Codex. Publish it in one click.
        </span>
      </div>
      <Link
        href={signupHref(slug)}
        className="bg-primary text-primary-foreground flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold"
      >
        Make your own, free <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
