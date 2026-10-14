"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQS } from "../_data/faqs";

export function FAQSection() {
  return (
    <section
      id="faq"
      className="relative scroll-mt-16 border-t px-4 py-16 md:px-8 md:py-28"
    >
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
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
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`}>
              <AccordionTrigger className="py-4 text-left text-lg font-medium md:py-6 md:text-xl">
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
