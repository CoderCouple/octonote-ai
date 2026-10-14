/**
 * /use-cases/<slug> pages: one search intent each, shown with the real
 * feature demo and real published examples (slugs from ./examples).
 */

export type UseCaseDemo = "notes" | "project" | "agents" | "canvas";

export interface UseCase {
  slug: string;
  /** Short name for links. */
  name: string;
  /** <title>. */
  title: string;
  description: string;
  h1: string;
  intro: string;
  demo: UseCaseDemo;
  steps: { title: string; body: string }[];
  /** Slugs from EXAMPLES. */
  examples: string[];
  faqs: { q: string; a: string }[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "math-and-mermaid-notes",
    name: "Notes with math and Mermaid",
    title: "Markdown notes with LaTeX math and Mermaid diagrams",
    description:
      "Write notes where LaTeX equations and Mermaid diagrams render in place. Paste markdown with $math$ and ```mermaid blocks and it converts automatically. Free to start.",
    h1: "Notes where math and diagrams just render.",
    intro:
      "Type an equation as you'd write it in LaTeX, sketch a flow in Mermaid, and see both rendered right in the note — no plugins, no screenshots.",
    demo: "notes",
    steps: [
      {
        title: "Type math inline or as a block",
        body: "Wrap LaTeX in $…$ for inline math or use the Math block for display equations. KaTeX renders it as you type.",
      },
      {
        title: "Write diagrams as text",
        body: "Type /mermaid for flowcharts, sequence diagrams and more. The source stays editable; readers see the diagram.",
      },
      {
        title: "Paste existing markdown",
        body: "Notes from Obsidian, GitHub or ChatGPT keep their $…$, $$…$$ and ```mermaid blocks — they convert on paste, and every note keeps a Markdown copy.",
      },
    ],
    examples: [
      "designing-a-distributed-rate-limiter-4dhz2j",
      "bayes-theorem-and-the-99-accurate-test-pjfmlb",
      "gradient-descent-from-intuition-to-update-rule-2xvfev",
    ],
    faqs: [
      {
        q: "Which math syntax is supported?",
        a: "LaTeX, rendered with KaTeX: $…$ inline, $$…$$ or a Math block for display equations, and ```math code blocks.",
      },
      {
        q: "Which Mermaid diagrams work?",
        a: "Every diagram type Mermaid renders — flowcharts, sequence diagrams, git graphs and more. Flowcharts can also become editable canvases through the octonote CLI.",
      },
      {
        q: "Can I publish a note with math and diagrams?",
        a: "Yes. Publish it as a public page in one click; equations and diagrams render for readers, who don't need an account.",
      },
    ],
  },
  {
    slug: "technical-explainers",
    name: "Technical explainers",
    title: "Write and publish technical explainers with notes and diagrams",
    description:
      "For creators who explain system design, algorithms and machine learning: write the note, draw the diagram beside it, and publish both as one beautiful page.",
    h1: "Write the explainer. Draw the diagram. Publish both.",
    intro:
      "System design, algorithms, machine learning: the best explanations mix prose, equations and a drawing. Octonote AI keeps them side by side and publishes them as one page.",
    demo: "project",
    steps: [
      {
        title: "Start a project",
        body: "A project is one note and one canvas in a split view — writing on the left, drawing on the right.",
      },
      {
        title: "Drag figures into the text",
        body: "Group shapes into a figure and drag it into the note by its title. Edit the drawing later and the note updates.",
      },
      {
        title: "Publish and share",
        body: "One click gives you a public page with your byline, a heading minimap, upvotes and view counts. Readers can switch between note, split and canvas.",
      },
    ],
    examples: [
      "self-attention-in-one-page-ag9yno",
      "how-a-url-shortener-works-kftx8d",
      "dijkstra-s-shortest-path-visually-0uhnao",
    ],
    faqs: [
      {
        q: "Who is this for?",
        a: "Engineers, educators and creators who explain technical topics on YouTube, LinkedIn, newsletters or blogs and want one link that holds both the write-up and the diagram.",
      },
      {
        q: "Can my AI agent write the first draft?",
        a: "Yes. With the octonote CLI, Claude Code or Codex can create the note from markdown and draw the canvas from a Mermaid flowchart, then you edit and publish.",
      },
      {
        q: "Do readers need an account?",
        a: "No. Published pages are public and read-only; signing in is only needed to upvote.",
      },
    ],
  },
];

export function findUseCase(slug: string) {
  return USE_CASES.find((u) => u.slug === slug) ?? null;
}
