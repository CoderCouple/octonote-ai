"use client";

import "@octonote/interactive/styles.css";
import { Flashcards, InteractiveProvider, type Flashcard } from "@octonote/interactive";
import digestive from "@octonote/interactive/examples/digestive-system.json";
import { useState } from "react";
import { renderRichText } from "@/features/notes/blocks/interactive-block";

const digestiveCards = (digestive as { activities: { type: string; cards?: Flashcard[] }[] }).activities.find((a) => a.type === "flashcards")!.cards!;

const maths: Flashcard[] = [
  { id: "m1", front: "Softmax of $z_i$", back: "$\\sigma(z)_i = \\dfrac{e^{z_i}}{\\sum_j e^{z_j}}$", hint: "Exponentiate, then normalise." },
  { id: "m2", front: "Scaled dot-product attention", back: "$\\text{Attention}(Q,K,V) = \\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V$" },
  { id: "m3", front: "Why divide by $\\sqrt{d_k}$?", back: "Dot products grow with the dimension; scaling keeps softmax out of its flat, tiny-gradient region." },
];

const long: Flashcard[] = [
  { id: "l1", front: "ReLU", back: "Rectified linear unit: max(0, x)." },
  {
    id: "l2",
    front: "What is the difference between a list, an array, a matrix and a tensor in the context of NumPy and neural networks?",
    back: "A list is a Python container that can hold anything, even sublists of different lengths. An array is homologous: every row has the same length, so it has a shape. A matrix is a 2D array. A tensor is an object that can be represented as an array of any number of dimensions. In practice, the book uses \"array\" and \"tensor\" almost interchangeably, because NumPy arrays are how we store tensors when coding neural networks.\n\nKeep in mind: a 1D array is a vector.",
  },
  { id: "l3", front: "Bias", back: "One per neuron, not tied to any input." },
];

const DAY = 86_400_000;

export function FlashcardsGallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(760);
  const [now] = useState(() => Date.now());
  const fg = theme === "dark" ? "#ddd" : "#333";
  return (
    <InteractiveProvider theme={theme} renderText={renderRichText}>
      <main className={theme === "dark" ? "min-h-screen bg-[#0b0b0c] p-8" : "min-h-screen bg-[#f6f6f4] p-8"}>
        <div className="mx-auto mb-6 flex max-w-5xl items-center gap-4 text-sm" style={{ color: fg }}>
          <strong>Flashcards gallery</strong>
          <button className="rounded border px-2 py-1" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            {theme}
          </button>
          <select className="rounded border px-2 py-1 text-black" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
            {[760, 520, 380].map((w) => (
              <option key={w} value={w}>
                {w}px
              </option>
            ))}
          </select>
        </div>
        {[
          { key: "digestive", title: "Digestive system", cards: digestiveCards, props: {} },
          { key: "maths", title: "Attention maths", cards: maths, props: { spacedRepetition: true } },
          { key: "long", title: "Long answers", cards: long, props: {} },
          {
            key: "caught",
            title: "Spaced repetition, nothing due",
            cards: maths,
            props: { spacedRepetition: true, defaultState: { order: ["m1", "m2", "m3"], index: 0, flipped: false, marks: {}, reviews: Object.fromEntries(maths.map((c, i) => [c.id, { box: 2, due: now + (i + 2) * DAY, reviews: 2 }])), prepared: false } },
          },
        ].map((d) => (
          <section key={`${d.key}-${theme}`} className="mx-auto mb-10" style={{ maxWidth: width }} data-example={d.key}>
            <Flashcards id={`dev-${d.key}`} cards={d.cards} title={d.title} theme={theme} {...d.props} />
          </section>
        ))}
      </main>
    </InteractiveProvider>
  );
}
