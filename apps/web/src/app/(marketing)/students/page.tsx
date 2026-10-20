import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import {
  ClosingCta,
  ContentHero,
  Faqs,
  Points,
} from "../_components/content-page";
import { NotesDemo } from "../_components/demos/notes-demo";
import { StudentsStructuredData } from "../_components/structured-data";
import { EXAMPLES } from "../_data/examples";
import {
  STUDENT_EXAMPLES,
  STUDENT_FAQS,
  STUDENT_OFFER,
  STUDENT_POINTS,
  STUDENT_SCHOOLS,
  STUDENT_STEPS,
} from "../_data/students";

const TITLE = "Free notes app for students, with LaTeX math and a whiteboard";
const DESCRIPTION = `Octonote AI is the notes app that speaks math: LaTeX, diagrams and a whiteboard next to your lecture notes. Students get ${STUDENT_OFFER} with a school email, at ${STUDENT_SCHOOLS}.`;

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: "/students" },
  openGraph: {
    type: "website",
    url: "/students",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function StudentsPage() {
  const examples = STUDENT_EXAMPLES.map((slug) =>
    EXAMPLES.find((e) => e.slug === slug),
  ).filter((e) => e !== undefined);

  return (
    <div className="px-4 pt-36 pb-28 md:px-8 md:pt-44">
      <StudentsStructuredData />
      <ContentHero
        eyebrow={`For students · ${STUDENT_OFFER}`}
        title="The notes app that speaks math."
        intro={`LaTeX, diagrams and a whiteboard next to your lecture notes. Sign up with your school email and get ${STUDENT_OFFER}, at ${STUDENT_SCHOOLS}.`}
      />

      <div className="mx-auto mt-20 max-w-7xl">
        <NotesDemo />
      </div>

      <Points title="Made for how you study" points={STUDENT_POINTS} />

      <Points title={`${STUDENT_OFFER}, in a minute`} points={STUDENT_STEPS} />

      {examples.length ? (
        <section className="mx-auto mt-28 max-w-6xl">
          <h2 className="text-foreground-strong text-center text-3xl font-bold md:text-4xl">
            Notes made with Octonote
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <Faqs faqs={STUDENT_FAQS} />
      <ClosingCta title="Your first lecture note is one click away." />
    </div>
  );
}
