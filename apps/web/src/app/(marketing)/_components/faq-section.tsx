"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Who is Octonote for?",
    a: "Anyone who thinks in both words and pictures — engineers writing design docs, product folks sketching flows, students and researchers keeping structured notes. Notes and canvases are equals here, not one bolted onto the other.",
  },
  {
    q: "How does sharing work?",
    a: "Like Google Docs. Invite people by email as viewers or editors, or open a note, canvas, project or whole notebook to anyone with the link. Sharing a notebook shares everything inside it.",
  },
  {
    q: "What does publishing do?",
    a: "Publishing turns a note, canvas, project or notebook into a clean, read-only public page with its own link. Unpublish any time and the page disappears immediately.",
  },
  {
    q: "Is there a mobile app?",
    a: "Yes — native apps for iPhone and Android, alongside the web app. Your notes and canvases are the same everywhere.",
  },
  {
    q: "What's the pricing?",
    a: "Free during private beta. When we open up general availability we'll publish a simple plan with a generous free tier. Beta users get grandfathered pricing.",
  },
  {
    q: "Do you store my notes as Markdown?",
    a: "Every note keeps a Markdown copy alongside the rich document, so your writing is never locked into a proprietary format.",
  },
];

export function FAQSection() {
  return (
    <section id="faq" className="relative scroll-mt-16 border-t px-4 py-28 md:px-8 md:py-40">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground text-base font-medium">
            FAQ
          </span>
          <h2 className="text-foreground-strong text-4xl font-bold md:text-display">
            Questions we hear the most.
          </h2>
          <p className="text-muted-foreground text-lg">
            Missing one?{" "}
            <a
              href="mailto:hello@octonote.ai"
              className="text-foreground hover:text-muted-foreground underline underline-offset-4"
            >
              Ask us
            </a>
            .
          </p>
        </div>
        <Accordion
          type="single"
          collapsible
          className="w-full"
        >
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`}>
              <AccordionTrigger className="py-6 text-left text-xl font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-lg leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
