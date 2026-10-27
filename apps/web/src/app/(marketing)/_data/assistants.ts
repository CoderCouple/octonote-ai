/**
 * The /claude and /chatgpt pages: Octonote inside chat assistants through
 * the remote MCP server (services/api McpController). Facts only — the tools
 * listed are the ones the server registers; steps are what each app shows
 * for a custom connector today (update once the directory listings are live).
 */

export const MCP_URL = "https://api.octonote.ai/mcp";

/** The published guide made through Octonote by AI agents (proof on the page). */
export const PROOF = {
  title: "Harness², explained in 9 chapters",
  body: "A deep guide to Google Research's Harness² repo: 60,000 words, 23 diagrams, and class diagrams where every box opens its code. Written and drawn by AI agents through Octonote.",
  href: "/pub/harness2-repo-guide-9eunnl",
};

export type AssistantSlug = "claude" | "chatgpt";

export interface Assistant {
  slug: AssistantSlug;
  name: string;
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  intro: string;
  openUrl: string;
  openLabel: string;
  steps: { title: string; body: string }[];
}

export const ASSISTANTS: Record<AssistantSlug, Assistant> = {
  claude: {
    slug: "claude",
    name: "Claude",
    title: "Octonote for Claude — notes and diagrams Claude writes for you",
    description:
      "Connect Octonote to Claude.ai and ask Claude to write notes, draw diagrams as editable canvases, organise notebooks and publish them. Free to start.",
    eyebrow: "Octonote + Claude",
    heroTitle: "Ask Claude. It's all kept in Octonote.",
    intro:
      "Connect Octonote to Claude and your chats turn into real notes, editable diagrams and notebooks you keep, share and publish.",
    openUrl: "https://claude.ai/settings/connectors",
    openLabel: "Open Claude connectors",
    steps: [
      {
        title: "Add the connector",
        body: "In Claude, open Settings → Connectors → Add custom connector. Name it Octonote and paste the connector URL.",
      },
      {
        title: "Sign in and allow",
        body: "Click Connect, sign in to Octonote (or create a free account) and choose Allow.",
      },
      {
        title: "Just ask",
        body: "Turn Octonote on in a chat and ask Claude to write it up, draw it or file it. Claude replies with the link.",
      },
    ],
  },
  chatgpt: {
    slug: "chatgpt",
    name: "ChatGPT",
    title: "Octonote for ChatGPT — save notes and diagrams from your chats",
    description:
      "Connect Octonote to ChatGPT and save answers as real notes, draw diagrams as editable canvases, organise notebooks and publish them. Free to start.",
    eyebrow: "Octonote + ChatGPT",
    heroTitle: "Ask ChatGPT. It's all kept in Octonote.",
    intro:
      "Connect Octonote to ChatGPT and good answers stop disappearing into chat history: they become notes, diagrams and notebooks you keep, share and publish.",
    openUrl: "https://chatgpt.com",
    openLabel: "Open ChatGPT",
    steps: [
      {
        title: "Add the server",
        body: "In ChatGPT on the web, open Plugins, click + and choose Add custom MCP server. Name it Octonote, paste the connector URL and pick OAuth.",
      },
      {
        title: "Sign in and allow",
        body: "Sign in to Octonote (or create a free account) and choose Allow.",
      },
      {
        title: "Just ask",
        body: "Pick Octonote from the + menu in a chat and ask ChatGPT to save it, draw it or file it. It replies with the link.",
      },
    ],
  },
};

export const ASSISTANT_POINTS = [
  {
    title: "Notes that last",
    body: "Answers become real notes with headings, tables, code, `$math$` and diagrams — kept in your workspace, not lost in chat history.",
  },
  {
    title: "Diagrams you can edit",
    body: "Flowcharts and class diagrams become canvases with real shapes you can drag and restyle. Boxes can link to code on GitHub.",
  },
  {
    title: "Organised for you",
    body: "Ask it to file things in a notebook, pair a write-up with a diagram as a project, or find something you saved last week.",
  },
  {
    title: "Publish in one ask",
    body: "Say “publish it” and get a clean public page with a link to share. Nothing is published or shared unless you ask.",
  },
  {
    title: "Works everywhere you are",
    body: "The same notes open in Octonote on the web, iPhone and Android, and in Claude Code or Codex through the CLI.",
  },
  {
    title: "You stay in control",
    body: "The assistant only sees what you can, your plan's limits apply, and you can disconnect it any time in Settings.",
  },
];

export const ASSISTANT_PROMPTS = [
  "Summarise this conversation as a note in my Research notebook.",
  "Draw our signup flow as a canvas.",
  "Explain this repo as a project: a write-up and a class diagram where each class links to its code.",
  "Find my notes about caching and add today's decision to the newest one.",
  "Turn these lecture notes into a study guide with the formulas in LaTeX.",
  "Publish the launch note and give me the link.",
];

export const assistantFaqs = (name: string) => [
  {
    q: `Is Octonote free to use with ${name}?`,
    a: "Yes. The free plan includes 10 notes, 10 canvases, 10 projects and 10 notebooks. Pro is $10 a month for unlimited, and students get Pro free for a year.",
  },
  {
    q: `What can ${name} do in my Octonote?`,
    a: "Search and read your items, create and update notes, draw canvases from flowcharts and class diagrams, make projects and notebooks, and rename or move things. Publishing, sharing and deleting only happen when you ask.",
  },
  {
    q: `Can ${name} see all my notes?`,
    a: `It sees what your account can see, only while you use it. You can disconnect ${name} any time in Settings → Connected apps, which ends its access at once.`,
  },
  {
    q: "Do I need to install anything?",
    a: `No. You add the connector URL in ${name} and sign in. Developers who prefer the terminal can use the Octonote CLI with Claude Code or Codex instead.`,
  },
  {
    q: "What kinds of diagrams work?",
    a: "Flowcharts and class diagrams become editable canvases. Other Mermaid diagrams — sequence, state, ER, gantt, timelines — appear rendered inside notes.",
  },
];
