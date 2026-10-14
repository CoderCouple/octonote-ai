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
  {
    slug: "obsidian",
    name: "Obsidian",
    title: "Octonote AI vs Obsidian: drawing, publishing and the web",
    h1: "Obsidian's markdown, with a real canvas and free publishing.",
    description:
      "Obsidian is a superb local-first markdown app. Octonote AI is web-based, with an infinite drawing canvas beside every note and free publishing. Compare math, Mermaid, canvases, agents and price.",
    intro:
      "Obsidian keeps markdown files on your own disk and grows with plugins. Octonote AI runs on the web and phone, puts a drawing canvas next to your notes, and publishes any page for free.",
    rows: [
      { feature: "LaTeX math", us: true, them: true },
      { feature: "Mermaid diagrams", us: true, them: true },
      {
        feature: "Canvas",
        us: "Infinite drawing canvas (tldraw) with auto-shape",
        them: "Canvas core plugin: arrange notes and cards",
      },
      {
        feature: "Freehand drawing built in",
        us: true,
        them: "Via community plugins",
      },
      {
        feature: "Where your notes live",
        us: "In the cloud; every note keeps a Markdown copy",
        them: "Markdown files on your device",
      },
      { feature: "Works offline", us: false, them: true },
      { feature: "Plugin ecosystem", us: false, them: true },
      {
        feature: "Claude Code / Codex can write into it",
        us: "octonote CLI, from any folder or the cloud",
        them: "Agents edit the vault's files directly",
      },
      {
        feature: "Publish to the web",
        us: "Included, with upvotes and view analytics",
        them: "Obsidian Publish, $8/site/month yearly ($10 monthly)",
      },
      {
        feature: "Sync across devices",
        us: "Included",
        them: "Obsidian Sync, $4/user/month yearly ($5 monthly)",
      },
      {
        feature: "Price",
        us: "Free plan; Pro $10/month per workspace, unlimited",
        them: "App free, including for work",
      },
    ],
    differences: [
      {
        title: "Draw next to your notes",
        body: "Every project pairs a note with an infinite canvas. Sketch rough, let auto-shape clean it up, and drag the figure into the note — it stays in sync.",
      },
      {
        title: "Publishing is included",
        body: "Publish a note, canvas, project or whole notebook as a clean page with a heading minimap, upvotes and private view counts, at no extra cost.",
      },
      {
        title: "Same notes on web and phone",
        body: "Nothing to sync or configure: open octonote.ai on any computer or phone and everything is there.",
      },
    ],
    chooseUs: [
      "You draw diagrams as often as you write.",
      "You want to publish pages without paying for a separate add-on.",
      "You work across computers and phone without setting up sync.",
    ],
    chooseThem: [
      "You want plain files on your own disk and full offline use.",
      "You rely on community plugins and deep customisation.",
      "You build a personal knowledge graph with backlinks.",
    ],
    faqs: [
      {
        q: "Can I bring my Obsidian notes to Octonote AI?",
        a: 'Yes. Obsidian notes are markdown, so paste one into a note or import it with `octonote note create "Title" --file note.md`. Math ($…$, $$…$$) and Mermaid blocks convert automatically.',
      },
      {
        q: "Does Obsidian have a canvas?",
        a: "Yes — the Canvas core plugin lays out notes and cards on a board. Freehand drawing comes from community plugins. Octonote AI's canvas is a full drawing board built in.",
      },
      {
        q: "Is Octonote AI local-first like Obsidian?",
        a: "No. Octonote AI is a cloud app, so your notes are on the web and your phone without setting up sync. Every note keeps a Markdown copy, so your writing is never locked in.",
      },
    ],
    sources: [
      { label: "Obsidian pricing", url: "https://obsidian.md/pricing" },
    ],
    checked: "October 2026",
  },
  {
    slug: "excalidraw",
    name: "Excalidraw",
    title: "Octonote AI vs Excalidraw: a whiteboard with notes attached",
    h1: "Excalidraw draws. Octonote AI draws and writes.",
    description:
      "Excalidraw is a fast, free hand-drawn whiteboard. Octonote AI pairs a clean canvas with a full notes editor — math, Mermaid and publishing included. Compare features and price.",
    intro:
      "Excalidraw is a lovely, free whiteboard with a hand-drawn look. Octonote AI is for when the drawing needs words around it: a full notes editor with math and Mermaid, side by side with the canvas.",
    rows: [
      {
        feature: "Canvas style",
        us: "Clean shapes (tldraw), auto-shape for sketches",
        them: "Hand-drawn look",
      },
      {
        feature: "Notes editor next to the canvas",
        us: true,
        them: false,
      },
      { feature: "LaTeX math", us: true, them: "Not built in" },
      {
        feature: "Mermaid",
        us: "In notes, and to editable canvases via CLI",
        them: "Mermaid to Excalidraw",
      },
      {
        feature: "AI diagram generation",
        us: "No — use your own agent",
        them: "10 requests/day free, 100 on Plus",
      },
      {
        feature: "Claude Code / Codex",
        us: "octonote CLI",
        them: "MCP server",
      },
      {
        feature: "Live collaboration",
        us: "Not yet",
        them: true,
      },
      {
        feature: "Public pages",
        us: "Published pages with byline, upvotes, analytics",
        them: "Read-only links (Plus)",
      },
      {
        feature: "Free plan",
        us: "10 notes, 10 canvases, 10 projects, 10 notebooks",
        them: "Free forever: one scene, unlimited collaborators",
      },
      {
        feature: "Paid plan",
        us: "Pro $10/month per workspace",
        them: "Plus $6/user/month",
      },
    ],
    differences: [
      {
        title: "Words around the drawing",
        body: "A project pairs a canvas with a full note: headings, math, code and Mermaid. Drag a group of shapes into the note as a figure and it stays in sync.",
      },
      {
        title: "Organised work",
        body: "Notes, canvases and projects live in notebooks, searchable by name, on any computer or phone.",
      },
      {
        title: "Pages people can read",
        body: "Publish a canvas, a note or a whole notebook as a page with your byline, upvotes and view counts — not just a board link.",
      },
    ],
    chooseUs: [
      "Your diagrams come with an explanation.",
      "You need math or Mermaid next to the drawing.",
      "You publish what you make for readers.",
    ],
    chooseThem: [
      "You love the hand-drawn style.",
      "You whiteboard live with others in real time.",
      "You need a quick, free board with no account.",
    ],
    faqs: [
      {
        q: "Can I draw by hand in Octonote AI?",
        a: "Yes. Draw with the pencil, and auto-shape turns wobbly strokes into clean rectangles, circles and arrows. The result looks polished rather than hand-drawn.",
      },
      {
        q: "Does Octonote AI have AI diagram generation like Excalidraw?",
        a: "Not inside the app. Your own agent (Claude Code or Codex) writes a Mermaid flowchart and `octonote canvas create --from-mermaid` draws it as editable shapes.",
      },
      {
        q: "Is there real-time collaboration?",
        a: "Not yet. You can share notes and canvases with editors and viewers, and publish them, but editing is one person at a time today.",
      },
    ],
    sources: [
      {
        label: "Excalidraw+ pricing",
        url: "https://plus.excalidraw.com/pricing",
      },
      {
        label: "Excalidraw+ MCP docs",
        url: "https://plus.excalidraw.com/docs/mcp",
      },
    ],
    checked: "October 2026",
  },
  {
    slug: "miro",
    name: "Miro",
    title:
      "Octonote AI vs Miro: a Miro alternative for explaining, not workshops",
    h1: "Miro is for workshops. Octonote AI is for explaining.",
    description:
      "Miro is a team whiteboard for workshops and planning. Octonote AI pairs notes and a canvas for writing and publishing explainers. Compare boards, docs, AI, agents and price.",
    intro:
      "Miro is built for teams running workshops, retros and planning on a shared board. Octonote AI is built for one person explaining something well — a note and a drawing side by side, published as a page.",
    rows: [
      { feature: "Infinite canvas", us: true, them: true },
      {
        feature: "Notes editor next to the canvas",
        us: "Projects: one note + one canvas, split view",
        them: "Miro Docs on the board",
      },
      { feature: "LaTeX math in notes", us: true, them: "Not documented" },
      { feature: "Mermaid diagrams", us: true, them: "Not documented" },
      {
        feature: "Live collaboration, workshops, templates",
        us: "Not yet",
        them: true,
      },
      {
        feature: "Built-in AI",
        us: "No — use your own agent",
        them: "AI credits on every plan",
      },
      {
        feature: "Claude Code / Codex",
        us: "octonote CLI",
        them: "Miro MCP server",
      },
      {
        feature: "Publish as a page",
        us: "Byline, upvotes, view analytics, whole notebooks",
        them: "Board sharing",
      },
      {
        feature: "Free plan",
        us: "10 notes, 10 canvases, 10 projects, 10 notebooks",
        them: "3 editable boards",
      },
      {
        feature: "Paid plan",
        us: "Pro $10/month per workspace",
        them: "Starter $8, Business $20 per member/month (yearly)",
      },
    ],
    differences: [
      {
        title: "Writing comes first",
        body: "A full notes editor with headings, math, code and Mermaid sits next to the canvas, so the explanation isn't squeezed into sticky notes.",
      },
      {
        title: "Made to be published",
        body: "Turn a project into a public page your readers can switch between note, split and canvas — with your byline, upvotes and view counts.",
      },
      {
        title: "Simple pricing for one person",
        body: "Pro is $10 a month per workspace with no per-member charges, and the free plan has every feature.",
      },
    ],
    chooseUs: [
      "You explain technical topics to readers.",
      "You want math and Mermaid next to your diagrams.",
      "You work mostly on your own.",
    ],
    chooseThem: [
      "You run workshops, retros or planning with a team.",
      "You need templates, sticky-note boards and live cursors.",
      "Your company already standardises on Miro.",
    ],
    faqs: [
      {
        q: "Is Octonote AI a Miro alternative?",
        a: "For individuals who explain things — yes. For team workshops with live collaboration, Miro is the better fit today.",
      },
      {
        q: "Can I share a canvas with people who don't have an account?",
        a: 'Yes. Turn on "anyone with the link" to let anyone view, or publish it as a public page. Readers never need an account.',
      },
      {
        q: "Does Octonote AI work with Claude?",
        a: "Yes. Install the octonote CLI and run `octonote setup claude`; Claude Code can then write notes, draw canvases from Mermaid and publish them for you.",
      },
    ],
    sources: [{ label: "Miro pricing", url: "https://miro.com/pricing/" }],
    checked: "October 2026",
  },
];

export function findComparison(slug: string) {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}
