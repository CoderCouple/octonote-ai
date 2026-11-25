"use client";

import "@octonote/slides/styles.css";
import "../slides.css";
import { SlideStage, SlideView, toDeckDocument, visibleDeckSlides } from "@octonote/slides";
import { FileDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CanvasReferenceContext, type CanvasReferenceResolver } from "@/features/notes/blocks/canvas-reference-context";
import { useSlideRenderers } from "../lib/renderers";

/** How long blocks get to draw (maths, mermaid, charts, canvases) before the print dialog opens. */
const SETTLE_MS = 2500;

/**
 * Every slide, fully built, one per landscape page: the browser's print
 * dialog saves it as a PDF. With `notes`, each page also carries the slide's
 * presenter notes (the presenter's own handout; published decks have none).
 */
export function DeckPrint({ title, document, notes = false, resolver }: { title: string; document: unknown; notes?: boolean; resolver: CanvasReferenceResolver }) {
  const deck = useMemo(() => toDeckDocument(document), [document]);
  const slides = useMemo(() => visibleDeckSlides(deck), [deck]);
  const renderers = useSlideRenderers(deck);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setReady(true);
      window.print();
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <CanvasReferenceContext.Provider value={resolver}>
      <style>{`
        @page { ${notes ? "size: letter portrait; margin: 0.5in;" : `size: ${deck.aspect === "4:3" ? "11in 8.25in" : "13.333in 7.5in"}; margin: 0;`} }
        @media print {
          html, body { background: #fff !important; }
          .oxd-print-bar { display: none !important; }
          .oxd-print-page { break-after: page; page-break-after: always; padding: 0 !important; gap: 0 !important; }
          .oxd-print-page:last-child { break-after: auto; }
          .oxd-print-page .osl-stage-box { border-radius: 0 !important; box-shadow: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="oxd-print-bar bg-background sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-medium">{title || "Untitled presentation"}</span>
        <span className="text-muted-foreground">{slides.length} slides</span>
        <button
          type="button"
          disabled={!ready}
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground flex h-8 items-center gap-1.5 rounded-md px-3 font-medium disabled:opacity-60"
        >
          {ready ? <FileDown className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
          {ready ? "Save as PDF" : "Preparing…"}
        </button>
      </div>
      <div className="mx-auto flex max-w-5xl flex-col">
        {slides.map((slide) => (
          <section key={slide.id} className="oxd-print-page flex flex-col gap-3 p-4">
            <SlideStage aspect={deck.aspect}>
              {/* Fully built: every click's block showing. */}
              <SlideView deck={deck} slide={slide} {...renderers} />
            </SlideStage>
            {notes && slide.notes.trim() ? <div className="text-sm leading-relaxed whitespace-pre-wrap">{slide.notes}</div> : null}
          </section>
        ))}
      </div>
    </CanvasReferenceContext.Provider>
  );
}
