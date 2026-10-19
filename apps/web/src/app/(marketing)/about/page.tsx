import { SUPPORT_EMAIL } from "@octonote/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { ClosingCta } from "../_components/content-page";
import { AboutStructuredData } from "../_components/structured-data";
import { FOUNDERS, PROFILES } from "../_data/company";

const TITLE = "About Octonote AI";
const DESCRIPTION =
  "Octonote AI is a workspace where notes and canvases are equals, built for people who explain things and the AI agents that work with them.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const BELIEFS = [
  {
    title: "Words and pictures are equals",
    body: "Most tools are a document with a whiteboard bolted on, or the other way round. In Octonote a note and a canvas sit side by side, and a project keeps the two together.",
  },
  {
    title: "Agents are users too",
    body: "Claude Code, Codex and scripts can write notes, draw canvases and publish pages through the octonote CLI, with your account and your permissions — and never publish or delete unless you ask.",
  },
  {
    title: "Your writing stays yours",
    body: "Every note keeps a Markdown copy, so nothing is locked into our format. Published pages carry no ads and no visitor tracking.",
  },
];

export default function AboutPage() {
  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <AboutStructuredData />
      <header className="mx-auto max-w-3xl">
        <p className="text-muted-foreground text-lg font-medium">About</p>
        <h1 className="text-foreground-strong mt-5 text-4xl leading-[1.1] font-bold md:text-6xl">
          A home for people who explain things.
        </h1>
        <p className="text-muted-foreground mt-8 text-xl leading-relaxed md:text-2xl">
          {SITE_NAME} is a notes and canvas workspace. Write with math, code
          and diagrams next to an infinite canvas, let your AI agents write
          into it, and publish any page to the web in one click.
        </p>
      </header>

      <section className="mx-auto mt-24 max-w-3xl">
        <h2 className="text-foreground-strong text-3xl font-bold md:text-4xl">
          What we believe
        </h2>
        <div className="mt-8 divide-y border-y">
          {BELIEFS.map((b) => (
            <div key={b.title} className="py-6">
              <h3 className="text-foreground-strong text-xl font-medium">
                {b.title}
              </h3>
              <p className="text-muted-foreground mt-3 text-lg leading-relaxed">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {FOUNDERS.length > 0 && (
        <section className="mx-auto mt-24 max-w-3xl">
          <h2 className="text-foreground-strong text-3xl font-bold md:text-4xl">
            Who we are
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {FOUNDERS.map((f) => (
              <li key={f.name} className="rounded-2xl border p-6">
                <p className="text-foreground-strong text-xl font-semibold">
                  {f.url ? (
                    <a href={f.url} className="hover:underline" rel="me">
                      {f.name}
                    </a>
                  ) : (
                    f.name
                  )}
                </p>
                <p className="text-muted-foreground mt-1 text-lg">{f.role}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto mt-24 max-w-3xl">
        <h2 className="text-foreground-strong text-3xl font-bold md:text-4xl">
          Get in touch
        </h2>
        <p className="text-muted-foreground mt-6 text-lg leading-relaxed">
          Questions, ideas or press:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          . Plans and prices are on the{" "}
          <Link
            href="/pricing"
            className="text-foreground underline underline-offset-4"
          >
            pricing page
          </Link>
          .
        </p>
        {PROFILES.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-3">
            {PROFILES.map((p) => (
              <li key={p.url}>
                <a
                  href={p.url}
                  rel="me noopener"
                  className="hover:bg-accent rounded-lg border px-4 py-2 text-base transition-colors"
                >
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClosingCta title="Your first note is one click away." />
    </div>
  );
}
