import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { SITE_URL } from "@/lib/site";

/** Building blocks shared by the /vs and /use-cases pages. */

export function ContentHero({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <header className="mx-auto max-w-4xl text-center">
      <p className="text-muted-foreground text-lg font-medium">{eyebrow}</p>
      <h1 className="text-foreground-strong mt-5 text-4xl leading-[1.1] font-bold md:text-6xl">
        {title}
      </h1>
      <p className="text-muted-foreground mx-auto mt-8 max-w-3xl text-xl md:text-2xl">
        {intro}
      </p>
      <div className="mt-10 flex justify-center">
        <SignupButton />
      </div>
    </header>
  );
}

export function SignupButton() {
  return (
    <Button asChild size="lg" className="h-14 gap-2.5 rounded-lg px-7 text-lg">
      <Link href="/signup">
        Get started free
        <ArrowRight className="size-5" />
      </Link>
    </Button>
  );
}

export function Points({
  title,
  points,
}: {
  title: string;
  points: { title: string; body: string }[];
}) {
  return (
    <section className="mx-auto mt-28 max-w-6xl">
      <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">
        {title}
      </h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {points.map((p) => (
          <div key={p.title}>
            <h3 className="text-foreground-strong text-xl font-semibold">
              {p.title}
            </h3>
            <p className="text-muted-foreground mt-3 text-lg">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Faqs({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <section className="mx-auto mt-28 max-w-3xl">
      <h2 className="text-foreground-strong text-3xl font-bold md:text-4xl">
        Questions
      </h2>
      <div className="mt-8 divide-y border-y">
        {faqs.map((f) => (
          <div key={f.q} className="py-6">
            <h3 className="text-foreground-strong text-xl font-medium">
              {f.q}
            </h3>
            <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
              <WithCode text={f.a} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Text with `backtick` spans shown as inline code. */
function WithCode({ text }: { text: string }) {
  return text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 ? (
      <code
        key={i}
        className="bg-muted text-foreground-strong rounded px-1.5 py-0.5 font-mono text-[0.85em]"
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}

export function ClosingCta({ title }: { title: string }) {
  return (
    <section className="mx-auto mt-28 max-w-3xl text-center">
      <h2 className="text-foreground-strong text-4xl font-bold md:text-5xl">
        {title}
      </h2>
      <p className="text-muted-foreground mt-6 text-xl">
        Free to start. No credit card, no password.
      </p>
      <div className="mt-10 flex justify-center">
        <SignupButton />
      </div>
    </section>
  );
}

/** FAQPage + breadcrumb data for a content page at `path`. */
export function ContentJsonLd({
  path,
  name,
  section,
  faqs,
}: {
  path: string;
  name: string;
  section: { name: string; path: string };
  faqs: { q: string; a: string }[];
}) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Octonote AI",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: section.name,
                item: `${SITE_URL}${section.path}`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name,
                item: `${SITE_URL}${path}`,
              },
            ],
          },
          {
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: f.a.replace(/`/g, ""),
              },
            })),
          },
        ],
      }}
    />
  );
}
