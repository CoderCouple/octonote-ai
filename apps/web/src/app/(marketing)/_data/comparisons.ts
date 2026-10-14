/**
 * /vs/<slug> comparison pages. Every claim about another product comes from
 * its own pricing page or docs (listed in `sources`) as of `checked` — when
 * you edit a row, re-check the source and bump `checked`. Where the other
 * product is the better fit, say so ("chooseThem"); that honesty is the point.
 */

/** true = yes, false = no, string = the short answer. */
export type Cell = boolean | string;

export interface Comparison {
  slug: string;
  name: string;
  /** <title>. */
  title: string;
  /** The page's headline. */
  h1: string;
  description: string;
  intro: string;
  rows: { feature: string; us: Cell; them: Cell }[];
  differences: { title: string; body: string }[];
  chooseUs: string[];
  chooseThem: string[];
  faqs: { q: string; a: string }[];
  sources: { label: string; url: string }[];
  /** Month the facts above were last checked. */
  checked: string;
}

export const COMPARISONS: Comparison[] = [
  {
    slug: "notion",
    name: "Notion",
    title: "Octonote AI vs Notion: a Notion alternative with a real canvas",
    h1: "The Notion alternative with a real canvas.",
    description:
      "Notion is a great all-in-one doc and database tool, but it has no native whiteboard. Octonote AI puts notes and an infinite canvas side by side, with math, Mermaid and one-click publishing.",
    intro:
      "Notion is the all-in-one workspace for docs, wikis and databases. Octonote AI is narrower on purpose: notes and an infinite canvas as equals, side by side, for people who explain things with both words and drawings.",
    rows: [
      {
        feature: "Infinite canvas / whiteboard",
        us: "Built in (tldraw)",
        them: "No native whiteboard — embeds or integrations",
      },
      { feature: "Note and drawing side by side", us: true, them: false },
      {
        feature: "Drawings embedded in notes stay in sync",
        us: true,
        them: false,
      },
      { feature: "LaTeX math", us: true, them: true },
      { feature: "Mermaid diagrams", us: true, them: true },
      { feature: "Databases, wikis and tasks", us: false, them: true },
      {
        feature: "Real-time collaboration and comments",
        us: "Not yet",
        them: true,
      },
      {
        feature: "Built-in AI",
        us: "No — use your own agent",
        them: "Notion AI (Business plan; trial on Free and Plus)",
      },
      {
        feature: "Claude Code / Codex can write into it",
        us: "octonote CLI",
        them: "Notion MCP server",
      },
      {
        feature: "Publish a page to the web",
        us: "Free, with byline, upvotes and view analytics",
        them: "Notion Sites",
      },
      {
        feature: "Custom domain",
        us: false,
        them: "Paid add-on ($8–10 per domain per month)",
      },
      {
        feature: "Free plan",
        us: "10 notes, 10 canvases, 10 projects, 10 notebooks",
        them: "Unlimited blocks for one person; limited with 2+ members",
      },
      {
        feature: "Paid plan",
        us: "Pro $10/month per workspace, unlimited",
        them: "Plus $10, Business $20 per member/month",
      },
    ],
    differences: [
      {
        title: "A canvas, not just pages",
        body: "Notion has no native whiteboard. In Octonote AI every canvas is an infinite, zoomable board with auto-shape, and a project pairs one note with one canvas in a split view.",
      },
      {
        title: "Figures that stay in sync",
        body: "Group shapes on the canvas into a figure and drag it into your note. Change the drawing and every embedded copy updates — no exporting screenshots.",
      },
      {
        title: "Publishing built for readers",
        body: "A published page shows your name, reading time, a heading minimap, upvotes and private view counts, and works for a note, a canvas, a project or a whole notebook.",
      },
    ],
    chooseUs: [
      "You explain things with drawings as much as with words.",
      "You publish technical explainers, cheat sheets or system designs.",
      "You want Claude Code or Codex to write notes and draw diagrams for you.",
    ],
    chooseThem: [
      "You need databases, task boards or a team wiki.",
      "Your team edits together in real time and leaves comments.",
      "You want AI built into the editor itself.",
    ],
    faqs: [
      {
        q: "Can I move my Notion notes to Octonote AI?",
        a: 'Yes. Export a Notion page as Markdown and paste it into a note — headings, lists, code, math and Mermaid blocks convert automatically. With the CLI, `octonote note create "Title" --file page.md` imports a file in one command.',
      },
      {
        q: "Does Notion have a whiteboard?",
        a: "Not natively, as of October 2026. People embed boards from other tools or use integrations. Octonote AI has an infinite canvas built in, next to your notes.",
      },
      {
        q: "Is Octonote AI cheaper than Notion?",
        a: "For one person, Pro is $10 a month for unlimited notes, canvases, projects and notebooks, and publishing is included. Notion Plus is $10 per member per month, and a custom domain for Notion Sites is a paid add-on.",
      },
    ],
    sources: [
      { label: "Notion pricing", url: "https://www.notion.com/pricing" },
    ],
    checked: "October 2026",
  },
  {
    slug: "eraser",
    name: "Eraser",
    title: "Octonote AI vs Eraser: notes and diagrams side by side",
    h1: "Notes and diagrams side by side — made to publish.",
    description:
      "Eraser and Octonote AI both pair docs with diagrams. Compare canvases, diagram-as-code, AI agents, publishing and pricing to pick the right one.",
    intro:
      "Eraser and Octonote AI share an idea: a document and a diagram belong side by side. Eraser leans into diagram-as-code and AI diagram generation for engineering teams. Octonote AI leans into freehand drawing, math and publishing explainers for readers.",
    rows: [
      { feature: "Doc and diagram side by side", us: true, them: true },
      {
        feature: "Drawing canvas",
        us: "Infinite tldraw canvas with auto-shape",
        them: "Whiteboard canvas",
      },
      {
        feature: "Diagram-as-code",
        us: "Mermaid, in notes and via CLI to editable canvases",
        them: "Eraser's own syntax (flow, sequence, ERD, cloud)",
      },
      {
        feature: "AI diagram generation",
        us: "No — use your own agent",
        them: "10 on Free, unlimited on Pro",
      },
      {
        feature: "Claude Code / Codex can write into it",
        us: "octonote CLI",
        them: "Eraser MCP server",
      },
      {
        feature: "LaTeX math in notes",
        us: true,
        them: "Not documented",
      },
      {
        feature: "Public pages",
        us: "Published pages with byline, upvotes, analytics; whole notebooks",
        them: "Publicly viewable share links",
      },
      {
        feature: "Free plan",
        us: "10 notes, 10 canvases, 10 projects, 10 notebooks",
        them: "5 files, 10 AI diagrams",
      },
      {
        feature: "Paid plan",
        us: "Pro $10/month per workspace",
        them: "Professional $10/member/month yearly, $12 monthly",
      },
    ],
    differences: [
      {
        title: "Draw it, don't just generate it",
        body: "Octonote AI's canvas is a full freehand board: sketch rough and auto-shape snaps strokes into clean boxes and arrows. Group them into figures and drag them into the note.",
      },
      {
        title: "Math and diagrams in the same note",
        body: "Notes take inline and display LaTeX, Mermaid diagrams and canvas figures together — ideal for ML, algorithms and system design explainers.",
      },
      {
        title: "Made to be read",
        body: "Publish a note, canvas, project or a whole notebook as a clean page with a heading minimap, upvotes and private view counts.",
      },
    ],
    chooseUs: [
      "You publish explainers for readers, not just internal design docs.",
      "You need math next to your diagrams.",
      "You like drawing by hand as much as writing diagram code.",
    ],
    chooseThem: [
      "You want AI to generate architecture diagrams from a prompt inside the app.",
      "You need Eraser's diagram types: ERDs, cloud architecture, sequence.",
      "Your engineering team edits design docs together.",
    ],
    faqs: [
      {
        q: "Can Octonote AI draw diagrams from text like Eraser?",
        a: 'Yes, with Mermaid. In a note, a Mermaid block renders in place. With the CLI, `octonote canvas create "Flow" --from-mermaid flow.mmd` turns a Mermaid flowchart into real, editable shapes on a canvas.',
      },
      {
        q: "Does Octonote AI have AI diagram generation?",
        a: "Not inside the app. Instead, your own agent — Claude Code or Codex — writes the Mermaid and the octonote CLI draws it, so you choose the model.",
      },
      {
        q: "How do the free plans compare?",
        a: "Eraser's free plan has 5 files and 10 AI diagrams. Octonote AI's free plan has 10 notes, 10 canvases, 10 projects and 10 notebooks, with every feature.",
      },
    ],
    sources: [
      { label: "Eraser pricing", url: "https://www.eraser.io/pricing" },
      { label: "Eraser MCP docs", url: "https://docs.eraser.io/docs/mcp" },
      {
        label: "Eraser sharing docs",
        url: "https://docs.eraser.io/docs/sharing-a-file",
      },
    ],
    checked: "October 2026",
  },
];

export function findComparison(slug: string) {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}
