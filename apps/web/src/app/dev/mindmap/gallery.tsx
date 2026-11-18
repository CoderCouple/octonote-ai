"use client";

import "@octonote/interactive/styles.css";
import { Mindmap, type MindmapNode } from "@octonote/interactive";
import digestive from "@octonote/interactive/examples/digestive-system.json";
import { useState } from "react";

const digestiveMap = (digestive as { activities: { type: string; nodes: MindmapNode[]; title?: string }[] }).activities.find((a) => a.type === "mindmap")!;

/** Builds nodes from an indented outline: two spaces per level, "label | note". */
function outline(text: string): MindmapNode[] {
  const nodes: MindmapNode[] = [];
  const stack: string[] = [];
  text
    .trim()
    .split("\n")
    .forEach((line, i) => {
      const depth = (line.length - line.trimStart().length) / 2;
      const [label, note] = line.trim().split(" | ");
      const id = `n${i}`;
      nodes.push({ id, label: label!, ...(depth ? { parent: stack[depth - 1] } : {}), ...(note ? { note } : {}) });
      stack[depth] = id;
    });
  return nodes;
}

const attention = outline(`
Attention in transformers
  Tokens and embeddings | Text is split into tokens, and each becomes a vector.
    Tokenisation
    Embedding lookup
    Positional encoding tells the model the word order
  Queries, keys and values | Each embedding is projected three ways.
    Q asks: what am I looking for?
    K answers: what do I contain?
    V carries the information that gets mixed
  Scores and softmax
    Dot product of every query with every key
    Divide by the square root of the key dimension to keep gradients stable
    Softmax turns scores into weights that sum to one
  Weighted sum
    Output is A times V
  Multi-head attention | Several heads attend in parallel and their outputs are concatenated.
    Different heads learn different relations
    Concatenate and project
  Variants
    MHA
    MQA shares one key and value head
    GQA groups heads
    MLA compresses the KV cache (DeepSeek)
  Supercalifragilisticexpialidociousness of very long unbroken words
`);

const big = outline(
  ["Biology"]
    .concat(
      ["Cells", "Genetics", "Evolution", "Ecology", "Anatomy", "Physiology", "Microbiology", "Botany"].flatMap((t, i) => [
        `  ${t}`,
        ...Array.from({ length: 6 }, (_, j) => `    ${t} topic ${j + 1}${j % 2 ? " with a longer label that wraps" : ""}`),
        ...(i % 3 === 0 ? ["      Deeper detail", "      Another detail"] : []),
      ]),
    )
    .join("\n"),
);

const small = outline(`
Water cycle
  Evaporation | Heat turns water to vapour.
    From oceans
  Condensation
    Clouds
`);

export function MindmapGallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState(900);
  const fg = theme === "dark" ? "#ddd" : "#333";
  return (
    <main className={theme === "dark" ? "min-h-screen bg-[#0b0b0c] p-8" : "min-h-screen bg-[#f6f6f4] p-8"}>
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-4 text-sm" style={{ color: fg }}>
        <strong>Mind map gallery</strong>
        <button className="rounded border px-2 py-1" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme}
        </button>
        <select className="rounded border px-2 py-1 text-black" value={width} onChange={(e) => setWidth(Number(e.target.value))}>
          {[900, 720, 520, 380].map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
      </div>
      {[
        { key: "attention", title: "Attention in transformers", nodes: attention },
        { key: "digestive", title: digestiveMap.title ?? "Digestive system", nodes: digestiveMap.nodes },
        { key: "small", title: "Water cycle", nodes: small },
        { key: "big", title: `Big map (${big.length} topics)`, nodes: big },
      ].map((m) => (
        <section key={`${m.key}-${theme}`} className="mx-auto mb-10" style={{ maxWidth: width }} data-example={m.key}>
          <Mindmap nodes={m.nodes} title={m.title} theme={theme} editable />
        </section>
      ))}
    </main>
  );
}
