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
  {
    slug: "publish-notes-as-a-website",
    name: "Publish notes as a website",
    title: "Publish your notes as a website in one click",
    description:
      "Turn a note, canvas or whole notebook into a clean public page with its own link — byline, heading minimap, upvotes and private view counts included. No site builder needed.",
    h1: "Publish your notes as a website. One click.",
    intro:
      "No site builder, no theme, no hosting. Flip one switch and any note, canvas, project or whole notebook becomes a clean public page with its own link.",
    demo: "notes",
    steps: [
      {
        title: "Write as usual",
        body: "Notes with headings, math, code and Mermaid diagrams, canvases for drawings, or both side by side in a project.",
      },
      {
        title: "Publish",
        body: "One switch gives the page its own URL with a proper link preview. Publish a notebook and everything inside it — including items you add later — goes with it.",
      },
      {
        title: "See who read it",
        body: "Views and unique readers for every published page, and upvotes from readers. No trackers; nothing is stored about your readers.",
      },
    ],
    examples: [
      "tcp-vs-udp-cheat-sheet-mpmg84",
      "the-osi-model-layer-by-layer-o5ce7u",
      "how-a-url-shortener-works-kftx8d",
    ],
    faqs: [
      {
        q: "Does publishing cost extra?",
        a: "No. Publishing is included on the free plan, with view counts and upvotes.",
      },
      {
        q: "Can I unpublish?",
        a: "Yes. Unpublish and the page stops working immediately.",
      },
      {
        q: "Can I use my own domain?",
        a: "Not yet. Published pages live at octonote.ai/pub/your-page.",
      },
    ],
  },
  {
    slug: "system-design-notes",
    name: "System design notes",
    title: "System design notes with architecture diagrams side by side",
    description:
      "Write system design notes next to the architecture diagram: an infinite canvas, figures that sync into the note, math for capacity estimates, and Mermaid for flows.",
    h1: "System design notes, with the diagram right beside them.",
    intro:
      "Capacity math, trade-offs and the architecture diagram belong on one page. Write on the left, draw on the right, and drag the diagram into the write-up.",
    demo: "canvas",
    steps: [
      {
        title: "Sketch the architecture",
        body: "Draw boxes and arrows by hand; auto-shape snaps them into clean shapes and connected arrows on an infinite canvas.",
      },
      {
        title: "Write the trade-offs",
        body: "Explain each component next to the drawing, with LaTeX for back-of-envelope numbers and Mermaid for request flows.",
      },
      {
        title: "Keep them in sync",
        body: "Group the diagram as a figure and drag it into the note. Change the canvas later and the note updates.",
      },
    ],
    examples: [
      "e-commerce-microservices-architecture-qw973b",
      "how-a-url-shortener-works-kftx8d",
      "designing-a-distributed-rate-limiter-4dhz2j",
    ],
    faqs: [
      {
        q: "Is it good for interview prep?",
        a: "Yes. Keep one project per design — note and diagram together — in a notebook, and review them on any device.",
      },
      {
        q: "Can I generate the diagram from text?",
        a: "Yes. Write a Mermaid flowchart in a note, or let the octonote CLI turn it into real, editable shapes on a canvas.",
      },
      {
        q: "Can I share a design with my team?",
        a: "Share it by email as an editor or viewer, open it to anyone with the link, or publish it as a public page.",
      },
    ],
  },
  {
    slug: "claude-code-notes",
    name: "Notes and diagrams for Claude Code",
    title: "Let Claude Code and Codex write your notes and draw your diagrams",
    description:
      "The octonote CLI lets Claude Code, Codex and scripts write markdown notes, draw canvases from Mermaid and publish them — with your permissions. Set up in three commands.",
    h1: "Let Claude Code write your notes and draw your diagrams.",
    intro:
      "Ask your agent to document a decision, draw the flow and publish it. The octonote CLI turns its markdown into notes and its Mermaid into real, editable canvases.",
    demo: "agents",
    steps: [
      {
        title: "Install and sign in",
        body: "Install the octonote CLI and run `octonote login` once per computer. Cloud agents and CI use a token from Settings instead.",
      },
      {
        title: "Teach your agent",
        body: "`octonote setup claude --skill` adds Octonote to CLAUDE.md and installs a skill; `octonote setup codex` does the same for Codex.",
      },
      {
        title: "Just ask",
        body: '"Write up the auth flow in my Architecture notebook, with a diagram, and publish it." Agents only publish, share or delete when you ask.',
      },
    ],
    examples: [
      "what-happens-when-you-run-kubectl-apply-o3w4pu",
      "ci-cd-pipeline-with-a-safe-rollout-q3tzr0",
      "a-git-branching-workflow-that-scales-jfyr2v",
    ],
    faqs: [
      {
        q: "What can the agent do?",
        a: "Create and edit notes from markdown, draw canvases from Mermaid flowcharts, create projects and notebooks, search, move, publish and share — with your account's permissions.",
      },
      {
        q: "Does it work with Codex and other agents?",
        a: "Yes. `octonote setup codex` writes AGENTS.md, and any tool that can run a shell command can use the CLI; output is JSON when piped.",
      },
      {
        q: "Is it safe?",
        a: "The agent acts as you, through the same permission checks as the app. It can't create tokens or delete your account, and `delete` needs an explicit --yes.",
      },
    ],
  },
];

export function findUseCase(slug: string) {
  return USE_CASES.find((u) => u.slug === slug) ?? null;
}
