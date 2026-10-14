import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** The /vs and /use-cases index pages: a heading and a list of cards. */
export function LinkHub({
  eyebrow,
  title,
  intro,
  items,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  items: { href: string; title: string; body: string }[];
}) {
  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-muted-foreground text-lg font-medium">{eyebrow}</p>
        <h1 className="text-foreground-strong mt-5 text-4xl font-bold md:text-6xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-6 text-xl">{intro}</p>
      </header>
      <div className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-2">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="bg-card hover:border-foreground-subtle group flex flex-col rounded-2xl border p-7 transition-colors"
          >
            <span className="text-foreground-strong text-xl font-semibold">
              {i.title}
            </span>
            <span className="text-muted-foreground mt-3 text-lg">{i.body}</span>
            <span className="text-muted-foreground group-hover:text-foreground-strong mt-6 flex items-center gap-1 text-sm font-medium">
              Read <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
