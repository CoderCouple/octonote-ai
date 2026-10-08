import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface LegalLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <section className="relative mx-auto max-w-3xl px-6 pt-32 pb-24 md:px-10">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground mb-10 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to home
      </Link>
      <header className="border-border/60 mb-12 border-b pb-8">
        <h1 className="text-foreground text-3xl font-medium tracking-tight md:text-4xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">Last updated · {lastUpdated}</p>
      </header>
      <article className="prose prose-neutral dark:prose-invert text-foreground/90 max-w-none space-y-8 text-base leading-relaxed">
        {children}
      </article>
    </section>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
        {heading}
      </h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed md:text-base">
        {children}
      </div>
    </section>
  );
}
