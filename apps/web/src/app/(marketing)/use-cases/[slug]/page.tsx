import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME } from "@/lib/site";
import {
  ClosingCta,
  ContentHero,
  ContentJsonLd,
  Faqs,
  Points,
} from "../../_components/content-page";
import { AgentsDemo } from "../../_components/demos/agents-demo";
import { CanvasDemo } from "../../_components/demos/canvas-demo";
import { NotesDemo } from "../../_components/demos/notes-demo";
import { ProjectDemo } from "../../_components/demos/project-demo";
import { EXAMPLES } from "../../_data/examples";
import {
  findUseCase,
  USE_CASES,
  type UseCaseDemo,
} from "../../_data/use-cases";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const u = findUseCase((await params).slug);
  if (!u) return {};
  const path = `/use-cases/${u.slug}`;
  return {
    title: { absolute: `${u.title} · ${SITE_NAME}` },
    description: u.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: SITE_NAME,
      title: u.title,
      description: u.description,
    },
    twitter: {
      card: "summary_large_image",
      title: u.title,
      description: u.description,
    },
  };
}

const DEMOS: Record<UseCaseDemo, () => React.ReactNode> = {
  notes: () => <NotesDemo />,
  project: () => <ProjectDemo />,
  agents: () => <AgentsDemo />,
  canvas: () => <CanvasDemo />,
};

export default async function UseCasePage({ params }: Params) {
  const u = findUseCase((await params).slug);
  if (!u) notFound();
  const path = `/use-cases/${u.slug}`;
  const examples = u.examples
    .map((slug) => EXAMPLES.find((e) => e.slug === slug))
    .filter((e) => e !== undefined);

  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <ContentJsonLd
        path={path}
        name={u.name}
        section={{ name: "Use cases", path: "/use-cases" }}
        faqs={u.faqs}
      />
      <ContentHero eyebrow={u.name} title={u.h1} intro={u.intro} />

      <div className="mx-auto mt-20 max-w-7xl">{DEMOS[u.demo]()}</div>

      <Points title="How it works" points={u.steps} />

      {examples.length ? (
        <section className="mx-auto mt-28 max-w-6xl">
          <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">
            Real examples
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {examples.map((e) => (
              <a
                key={e.slug}
                href={`/pub/${e.slug}`}
                className="bg-card hover:border-foreground-subtle group flex flex-col rounded-2xl border p-6 transition-colors"
              >
                <span className="text-muted-foreground text-sm">
                  {e.kind} · {e.tag}
                </span>
                <span className="text-foreground-strong mt-3 text-lg leading-snug font-semibold">
                  {e.title}
                </span>
                <span className="text-muted-foreground group-hover:text-foreground-strong mt-auto flex items-center gap-1 pt-6 text-sm font-medium">
                  Open page <ArrowUpRight className="size-4" />
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <Faqs faqs={u.faqs} />

      <p className="text-muted-foreground mx-auto mt-16 max-w-3xl text-center text-lg">
        More:{" "}
        {USE_CASES.filter((o) => o.slug !== u.slug).map((o, i) => (
          <span key={o.slug}>
            {i > 0 ? " · " : ""}
            <Link
              href={`/use-cases/${o.slug}`}
              className="text-foreground-strong underline underline-offset-4"
            >
              {o.name}
            </Link>
          </span>
        ))}
        {" · "}
        <Link
          href="/cli"
          className="text-foreground-strong underline underline-offset-4"
        >
          Use with Claude Code and Codex
        </Link>
      </p>

      <ClosingCta title="Start your first one free." />
    </div>
  );
}
