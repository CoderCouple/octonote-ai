import { ArrowRight, ArrowUpRight, Bot, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Aura } from "./_components/aura";
import { BookDemoButton } from "./_components/book-demo";
import { CopyField } from "./_components/copy-field";
import { CodingAgentsDemo } from "./_components/demos/coding-agents-demo";
import { AssistantsDemo } from "./_components/demos/assistants-demo";
import { InteractiveNotesDemo } from "./_components/demos/interactive-notes-demo";
import { MobileDemo } from "./_components/demos/mobile-demo";
import { ExamplesSection } from "./_components/examples-section";
import { FAQSection } from "./_components/faq-section";
import { FeatureSection } from "./_components/feature-section";
import { HeroWriterDemo } from "./_components/hero-writer-demo";
import { MeteorShower } from "./_components/meteor-shower";
import { PricingSection } from "./_components/pricing-section";
import { RotatingWord } from "./_components/rotating-word";
import { HomeStructuredData } from "./_components/structured-data";
import { TerminalWindow } from "./cli/_components/terminal-window";
import { INSTALL, INSTALL_BACKUP } from "./cli/_data/install";
import { MCP_URL } from "./_data/assistants";

/** The three setup commands in one copyable terminal, with a link to the CLI docs. */
function AgentSetup() {
  return (
    <div className="text-left">
      <TerminalWindow
        code={`# 1. Install
${INSTALL}

# 2. Sign in (opens your browser once)
octonote login

# 3. Teach your agent (pick yours)
octonote setup claude --skill
octonote setup codex
octonote setup gemini`}
      />
      <p className="text-muted-foreground mt-6 text-center text-lg">
        Then just ask.{" "}
        <Link
          href="/cli"
          className="text-foreground-strong inline-flex items-center gap-1 underline underline-offset-4"
        >
          CLI docs <ArrowUpRight className="size-4" />
        </Link>
      </p>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        npm registry blocked? Install from octonote.ai instead:{" "}
        <code className="text-foreground font-mono break-all">{INSTALL_BACKUP}</code>
      </p>
    </div>
  );
}

/** Links to the Claude and ChatGPT setup pages, with the connector URL to paste. */
function AssistantSetup() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="w-full max-w-xl">
        <CopyField value={MCP_URL} label="Connector URL" />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="h-12 gap-2 px-6 text-base">
          <Link href="/claude">
            Set up in Claude <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12 gap-2 px-6 text-base">
          <Link href="/chatgpt">
            Set up in ChatGPT <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
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
            <BookDemoButton className="h-14 px-7 text-lg" />
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-14 px-7 text-lg max-sm:hidden"
            >
              <Link href="#examples">See examples</Link>
            </Button>
          </div>
          <div className="mt-10 w-full md:mt-20">
            <HeroWriterDemo />
          </div>
        </div>
      </section>

      <FeatureSection
        id="interactive"
        aura
        className="border-t"
        eyebrow="Interactive notes"
        title="Notes you can play with."
        body="Put widgets, infographics, quizzes, flashcards, mind maps and animations in any note: type /, or ask the AI to build one from what you've written. Readers drag, answer and explore right on the page."
        demo={<InteractiveNotesDemo />}
        points={[
          {
            title: "Built for you",
            body: "Type /build with AI, or ask Claude, ChatGPT or the CLI. Every block is checked before it's saved, and you can edit it as JSON or ask AI to change it.",
          },
          {
            title: "Learn by doing",
            body: "Drag numbers and points, answer eight kinds of question, flip flashcards with spaced repetition, and test yourself on a mind map.",
          },
          {
            title: "Shared and published",
            body: "Blocks work on published pages and phones, in light and dark. Each reader's answers and settings stay in their own browser.",
          },
        ]}
      />

      <FeatureSection
        id="assistants"
        className="border-t"
        eyebrow="Claude, ChatGPT & Gemini"
        title={
          <>
            Now inside <RotatingWord words={["Claude", "ChatGPT", "Gemini"]} />.
          </>
        }
        body="Connect Octonote to Claude or ChatGPT once and ask in the chat: answers become real notes, diagrams become editable canvases, and everything is filed in your notebooks. Coming soon: a Chrome extension for Claude, ChatGPT and Gemini to clip answers as you go and bring your notes back into any chat."
        demo={<AssistantsDemo />}
        points={[
          {
            title: "One connector",
            body: "Paste the connector URL in Claude.ai or ChatGPT, sign in, and choose Allow. No install.",
          },
          {
            title: "Clip as you chat (coming soon)",
            body: "The Octonote Clipper extension adds a Clip button to ChatGPT, Claude and Gemini. Clips collect in a side panel, ready to turn into a note.",
          },
          {
            title: "Bring your notes in (coming soon)",
            body: "Type #octonote in the chat box to insert a note, canvas or project. Note access is off until you turn it on.",
          },
        ]}
        footer={<AssistantSetup />}
      />

      <FeatureSection
        id="agents"
        aura
        className="border-y"
        eyebrow="Claude Code, Codex & Gemini CLI"
        title={
          <>
            Just ask{" "}
            <RotatingWord words={["Claude", "Codex", "Gemini"]} />. It's
            all kept here.
          </>
        }
        body="Set up once, and your agent saves the notes, decisions and diagrams from every conversation to Octonote — then finds them again whenever you ask."
        demo={<CodingAgentsDemo />}
        points={[
          {
            title: "Set up in a minute",
            body: "Install the CLI, sign in, and one command teaches Claude Code, Codex or Gemini CLI to use Octonote.",
          },
          {
            title: "Save as you work",
            body: "Ask your agent to write it up: notes from markdown and real, editable diagrams, filed in your notebooks.",
          },
          {
            title: "Recall it later",
            body: "In any new session, your agent searches and reads your notes, with your permissions, so context is never lost.",
          },
        ]}
        footer={<AgentSetup />}
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
