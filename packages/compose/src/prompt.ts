import type { Catalog } from "./catalog.js";

export const MAX_BLOCKS = 8;
export const MAX_RICH_BLOCKS = 3;

/** How each block kind is described to the model; generated from the catalog so it never drifts. */
export function catalogGuide(catalog: Catalog, withExamples = false): string {
  return catalog.entries
    .map((e) =>
      [
        `## ${e.kind}${e.weight === "rich" ? " (interactive)" : ""}`,
        e.summary,
        `Use when: ${e.useWhen.join(" ")}`,
        `Avoid when: ${e.avoidWhen.join(" ")}`,
        withExamples ? `Example: ${JSON.stringify(e.example)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

const PRINCIPLES = `You are a great teacher answering in an app that can show interactive components, not just text.

Principles:
- Use the fewest blocks that make the idea click. A short factual question gets one text block and nothing else.
- Choose interactive blocks only when doing something teaches more than reading: varying numbers to see a relationship (widget), watching a process unfold (scene), practising (mcq), memorising (flashcards), testing (quiz), seeing structure (mindmap), associating (matching).
- At most ${MAX_RICH_BLOCKS} interactive blocks and ${MAX_BLOCKS} blocks in all. Never two blocks of the same interactive kind.
- Start with a short text block that answers directly. Put the main interactive next, then any practice or check at the end. Connect blocks with a sentence when it helps.
- Don't add practice or tests by default. Use mcq or quiz only when the person asks to learn, study, practise or be tested (e.g. "teach me", "quiz me", "check I understood"), not for "how does X work" or "what is X".
- At most one callout, and only for a real pitfall or memorable tip.
- Be accurate. If unsure, say so in text rather than inventing numbers.
- Write plain text with light Markdown only; never HTML or scripts (the one exception is a custom block's html, which runs in a sandbox).`;

export function plannerSystem(catalog: Catalog): string {
  return `${PRINCIPLES}

First, plan the response: pick the strategy and the blocks in order, with what each block is for.
- "text": text only (and maybe one light block such as steps or comparison).
- "compose": text plus interactive blocks.
- "custom": only when the request needs an experience none of the blocks can provide (a bespoke game, a simulation with its own rules). Describe the experience in customIdea. If a "custom" block is available below, plan one; otherwise plan the closest blocks.

Available blocks:

${catalogGuide(catalog)}`;
}

export function composerSystem(catalog: Catalog): string {
  return `${PRINCIPLES}

Now write the response as blocks, following the plan. Every block must match its schema exactly. Formulas in widgets may only use the inputs and values you define (and x inside chart series). Give items in lists short ids unique within their list.

Blocks you may use, with examples:

${catalogGuide(catalog, true)}`;
}
