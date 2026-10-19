import { ArrowRight, ArrowUpRight, Bot, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Aura } from "./_components/aura";
import { AgentsDemo } from "./_components/demos/agents-demo";
import { CanvasDemo } from "./_components/demos/canvas-demo";
import { MobileDemo } from "./_components/demos/mobile-demo";
import { NotesDemo } from "./_components/demos/notes-demo";
import { ProjectDemo } from "./_components/demos/project-demo";
import { ExamplesSection } from "./_components/examples-section";
import { FAQSection } from "./_components/faq-section";
import { FeatureSection } from "./_components/feature-section";
import { HeroStoryDemo } from "./_components/hero-story-demo";
import { MeteorShower } from "./_components/meteor-shower";
import { PricingSection } from "./_components/pricing-section";
import { HomeStructuredData } from "./_components/structured-data";
import { CodeBlock } from "./cli/_components/code-block";
import { INSTALL } from "./cli/_data/install";

const SETUP = [
  { step: "1", title: "Install", code: INSTALL },
  { step: "2", title: "Sign in", code: "octonote login" },
  {
    step: "3",
    title: "Teach your agent",
    code: "octonote setup claude --skill",
  },
];

/** The three setup commands, copyable, with a link to the full CLI docs. */
function AgentSetup() {
  return (
    <div className="text-left">
      <ol className="flex flex-col gap-3">
        {SETUP.map((s) => (
          <li
            key={s.step}
            className="grid min-w-0 items-center gap-2 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-4"
          >
            <p className="text-foreground-strong flex items-center gap-2 text-base font-semibold">
              <span className="bg-foreground-strong text-background inline-grid size-6 place-items-center rounded-full text-xs">
                {s.step}
              </span>
              {s.title}
            </p>
            <CodeBlock code={s.code} />
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-6 text-center text-lg">
        Using Codex? Run{" "}
        <code className="font-mono text-base">octonote setup codex</code>.{" "}
        <Link
          href="/cli"
          className="text-foreground-strong inline-flex items-center gap-1 underline underline-offset-4"
        >
          CLI docs <ArrowUpRight className="size-4" />
        </Link>
      </p>
    </div>
  );
}

function PrimaryCta({ className }: { className?: string }) {
  return (
    <Button
      asChild
      size="lg"
      className={`h-14 gap-2.5 rounded-lg px-7 text-lg ${className ?? ""}`}
    >
      <Link href="/signup">
        Get started
        <ArrowRight className="size-5" />
      </Link>
    </Button>
  );
}

export default function LandingPage() {
  return (
    <>
      <HomeStructuredData />
      <section className="relative overflow-hidden px-4 pt-28 pb-14 md:px-8 md:pt-40 md:pb-24">
        <Aura />
        <MeteorShower />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center text-center">
          <h1 className="text-foreground-strong text-[clamp(1.75rem,7.5vw,6rem)] leading-[1.1] font-bold">
            <span className="animate-word-rise block">
              The AI workspace for
            </span>
            <span className="block whitespace-nowrap">
              <span className="animate-word-rise inline-flex items-center gap-[0.2em] [animation-delay:250ms]">
                <User
                  aria-hidden
                  className="size-[0.75em]"
                  strokeWidth={2.25}
                />
                Humans
              </span>{" "}
              <span className="text-foreground-subtle animate-word-rise inline-block [animation-delay:400ms]">
                and
              </span>{" "}
              <span className="animate-word-rise inline-flex items-center gap-[0.2em] [animation-delay:550ms]">
                <Bot aria-hidden className="size-[0.75em]" strokeWidth={2.25} />
                Agents.
              </span>
            </span>
          </h1>
          <p className="text-muted-foreground animate-word-rise mt-6 max-w-4xl text-lg [animation-delay:800ms] md:mt-8 md:text-2xl">
            <span className="block md:whitespace-nowrap">
              Notes and Canvas side by side — written by You, or Claude or
              Codex.
            </span>
            Publish it as a beautiful page.
          </p>
          <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:gap-4 md:mt-10">
            <PrimaryCta />
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-14 px-7 text-lg"
            >
              <Link href="#examples">See examples</Link>
            </Button>
          </div>
          <div className="mt-10 w-full md:mt-20">
            <HeroStoryDemo />
          </div>
        </div>
      </section>

      <FeatureSection
        id="agents"
        aura
        className="border-y"
        eyebrow="Claude Code & Codex"
        title="Just ask Claude. It's all kept here."
        body="Set up once, and your agent saves the notes, decisions and diagrams from every conversation to Octonote — then finds them again whenever you ask."
        demo={<AgentsDemo />}
        points={[
          {
            title: "Set up in a minute",
            body: "Install the CLI, sign in, and one command teaches Claude Code (or Codex) to use Octonote.",
          },
          {
            title: "Save as you work",
            body: "Ask Claude to write it up: notes from markdown and real, editable diagrams, filed in your notebooks.",
          },
          {
            title: "Recall it later",
            body: "In any new session, Claude searches and reads your notes, with your permissions, so context is never lost.",
          },
        ]}
        footer={<AgentSetup />}
      />

      <FeatureSection
        id="notes"
        eyebrow="Notes"
        title="Write like a doc. Explain like a textbook."
        body="A block editor that speaks math and diagrams. Type an equation, sketch a flow in Mermaid, or drop in a figure from a canvas — all in one page."
        demo={<NotesDemo />}
        points={[
          {
            title: "Math that renders",
            body: "Inline and display equations with KaTeX, typed as you'd write them.",
          },
          {
            title: "Diagrams as text",
            body: "Mermaid flowcharts, sequence diagrams and git graphs, rendered in place.",
          },
          {
            title: "Paste markdown",
            body: "Math, code and diagrams in pasted markdown convert automatically — and every note keeps a Markdown copy.",
          },
        ]}
      />

      <FeatureSection
        id="canvases"
        className="border-t"
        eyebrow="Canvases"
        title="Sketch rough. Get it clean."
        body="An infinite canvas for flows, maps and architecture diagrams. Draw by hand and auto-shape snaps strokes into tidy shapes and connected arrows."
        demo={<CanvasDemo />}
        points={[
          {
            title: "Room to think",
            body: "An infinite, zoomable board for anything you'd put on a whiteboard.",
          },
          {
            title: "Auto-shape",
            body: "Wobbly pencil strokes become clean rectangles, circles and arrows.",
          },
          {
            title: "Figures",
            body: "Name parts of a canvas, jump between them, and embed them in notes.",
          },
        ]}
      />

      <FeatureSection
        id="projects"
        className="border-t"
        eyebrow="Projects"
        title="One note. One canvas. Side by side."
        body="A project pairs a note with a canvas. Group shapes into a figure, drag it into your writing, and it stays in sync as the drawing changes."
        demo={<ProjectDemo />}
        points={[
          {
            title: "Notes, Split or Canvas",
            body: "Switch views in one click; the project remembers how you like it.",
          },
          {
            title: "Figures you can drag",
            body: "Group shapes into a figure and drag it by its title into the note.",
          },
          {
            title: "Always in sync",
            body: "Change the drawing and every embedded figure updates.",
          },
        ]}
      />

      <FeatureSection
        id="mobile"
        eyebrow="Everywhere"
        title="Coming soon to iPhone and Android."
        body="Native apps are on their way to the App Store and Google Play, with the same five tabs on both — Home, Notes, Canvases, Projects and Notebooks — and the same editor you use on the web."
        demo={<MobileDemo />}
        points={[
          {
            title: "Feels native",
            body: "Native tabs, navigation and swipe-back on both platforms.",
          },
          {
            title: "Find anything",
            body: "Search notes, canvases, projects and notebooks by name.",
          },
          {
            title: "No passwords",
            body: "Sign in with a one-time code from your email.",
          },
        ]}
      />

      <ExamplesSection />

      <PricingSection />
      <FAQSection />

      <section className="relative overflow-hidden border-t px-4 py-20 text-center md:px-8 md:py-32">
        <Aura />
        <MeteorShower />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-foreground-strong md:text-display-xl text-5xl font-bold">
            Your first note is one click away.
          </h2>
          <p className="text-muted-foreground mt-5 text-lg md:mt-8 md:text-2xl">
            Free to start. No credit card, no password.
          </p>
          <PrimaryCta className="mt-10" />
        </div>
      </section>
    </>
  );
}
