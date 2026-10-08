import { ArrowRight, Bot, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Aura } from "./_components/aura";
import { CanvasDemo } from "./_components/demos/canvas-demo";
import { MobileDemo } from "./_components/demos/mobile-demo";
import { NotebookDemo } from "./_components/demos/notebook-demo";
import { NotesDemo } from "./_components/demos/notes-demo";
import { ShareDemo } from "./_components/demos/share-demo";
import { FAQSection } from "./_components/faq-section";
import { FeatureSection } from "./_components/feature-section";
import { HeroSplitDemo } from "./_components/hero-split-demo";
import { WaitlistSection } from "./_components/waitlist-section";

function PrimaryCta({ className }: { className?: string }) {
  return (
    <Button asChild size="lg" className={`h-14 gap-2.5 rounded-lg px-7 text-lg ${className ?? ""}`}>
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
      <section className="relative overflow-hidden px-4 pt-36 pb-24 md:px-8 md:pt-48 md:pb-32">
        <Aura />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center text-center">
          <h1 className="text-foreground-strong text-[clamp(1.75rem,6.5vw,6rem)] leading-[1.1] font-bold">
            <span className="animate-word-rise block">The AI workspace for</span>
            <span className="block whitespace-nowrap">
              <span className="animate-word-rise inline-flex items-center gap-[0.2em] [animation-delay:250ms]">
                <User aria-hidden className="size-[0.75em]" strokeWidth={2.25} />
                Humans
              </span>{" "}
              <span className="text-foreground-subtle animate-word-rise inline-block [animation-delay:400ms]">and</span>{" "}
              <span className="animate-word-rise inline-flex items-center gap-[0.2em] [animation-delay:550ms]">
                <Bot aria-hidden className="size-[0.75em]" strokeWidth={2.25} />
                Agents.
              </span>
            </span>
          </h1>
          <p className="text-muted-foreground animate-word-rise mt-10 max-w-3xl text-xl [animation-delay:800ms] md:text-2xl">
            Notes, canvas, and agents in one workspace. Every AI change is a typed patch — nothing moves
            without your OK.
          </p>
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
            <PrimaryCta />
            <Button asChild size="lg" variant="ghost" className="h-14 px-7 text-lg">
              <Link href="#sharing">See how sharing works</Link>
            </Button>
          </div>
          <div className="mt-20 w-full md:mt-28">
            <HeroSplitDemo />
          </div>
        </div>
      </section>

      <div id="features">
        <FeatureSection
          eyebrow="Notes"
          title="A page that gets out of the way."
          body="Headings, lists, to-dos, code and images — typed, not configured. Type /canvas to drop a live preview of any drawing into the page."
          demo={<NotesDemo />}
          points={[
            { title: "Write without friction", body: "A block editor with the markdown shortcuts your fingers already know." },
            { title: "Never lose a word", body: "Everything saves as you type, on every device." },
            { title: "Read it your way", body: "Pick the font, size and line height that suit you." },
          ]}
        />

        <FeatureSection
          eyebrow="Canvas"
          title="Sketch rough. Get it clean."
          body="An infinite canvas for flows, maps and diagrams. Turn on auto-shape and wobbly pencil strokes snap into tidy rectangles, circles and arrows."
          demo={<CanvasDemo />}
          className="border-t"
          points={[
            { title: "Room to think", body: "An infinite, zoomable board for anything you'd draw on a whiteboard." },
            { title: "Auto-shape", body: "Draw by hand; get clean shapes and connected arrows." },
            { title: "Side by side", body: "Pair a canvas with a note in a project and work on both at once." },
          ]}
        />
      </div>

      <FeatureSection
        id="sharing"
        aura
        className="border-y"
        eyebrow="Sharing & publishing"
        title={
          <>
            Share like a doc.
            <br />
            Publish like a site.
          </>
        }
        body="Invite people as viewers or editors, open it to anyone with the link, or publish a clean public page. Unpublish and it's gone instantly."
        demo={<ShareDemo />}
        points={[
          { title: "People with access", body: "Add anyone by email as an Editor or Viewer. No account yet? Access starts the moment they sign up." },
          { title: "Anyone with the link", body: "One switch makes the link work for everyone — readers don't need an account." },
          { title: "Publish to the web", body: "A fast, read-only page at its own URL, with proper previews wherever you paste it." },
        ]}
      />

      <FeatureSection
        eyebrow="Notebooks"
        title="Group it. Share it all at once."
        body="Collect notes, canvases and projects into a notebook. Share or publish the notebook and everything inside follows — including things you add later, clearly labelled."
        demo={<NotebookDemo />}
        points={[
          { title: "One place for related work", body: "Notes, canvases and projects, together." },
          { title: "Access flows down", body: "Share or publish once; every item inside follows." },
          { title: "Safe to tidy up", body: "Delete a notebook and everything in it stays." },
        ]}
      />

      <FeatureSection
        id="mobile"
        className="border-t"
        eyebrow="Mobile"
        title="Native on iPhone and Android."
        body="Real native navigation, lists and gestures — with the same editor you use on the web, so nothing gets lost between devices."
        demo={<MobileDemo />}
        points={[
          { title: "Feels native", body: "Native tabs, large titles and swipe-back on both platforms." },
          { title: "No passwords", body: "Sign in with a one-time code from your email." },
          { title: "Same notes everywhere", body: "Start on your laptop, finish on the train." },
        ]}
      />

      <FAQSection />
      <WaitlistSection />

      <section className="relative overflow-hidden border-t px-4 py-32 text-center md:px-8 md:py-44">
        <Aura />
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-foreground-strong md:text-display-xl text-5xl font-bold">
            Your first note is one click away.
          </h2>
          <p className="text-muted-foreground mt-8 text-xl md:text-2xl">Free while in beta. Email or Google sign-in.</p>
          <PrimaryCta className="mt-10" />
        </div>
      </section>
    </>
  );
}
