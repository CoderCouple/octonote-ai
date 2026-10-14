/** Shown by the FAQ section and sent to search engines as FAQPage data. */
export const FAQS: { q: string; a: string }[] = [
  {
    q: "Who is Octonote AI for?",
    a: "Anyone who thinks in both words and pictures — engineers writing design docs, product folks sketching flows, students and researchers keeping structured notes. Notes and canvases are equals here, not one bolted onto the other.",
  },
  {
    q: "How does sharing work?",
    a: "Like Google Docs. Invite people by email as viewers or editors, or open a note, canvas, project or whole notebook to anyone with the link. Sharing a notebook shares everything inside it, including things you add later.",
  },
  {
    q: "What does publishing do?",
    a: "Publishing turns a note, canvas, project or notebook into a clean, read-only public page with its own link. Unpublish any time and the page disappears immediately.",
  },
  {
    q: "Do you store my notes as Markdown?",
    a: "Every note keeps a Markdown copy alongside the rich document, so your writing is never locked into a proprietary format.",
  },
  {
    q: "Does it work with Claude Code and Codex?",
    a: 'Yes. Install the octonote CLI, sign in once, and run "octonote setup claude" or "octonote setup codex". Your agent can then write notes, draw canvases from mermaid, organise notebooks and publish — using your account and permissions.',
  },
  {
    q: "Will an agent publish or delete things on its own?",
    a: "No. The guide agents follow tells them to publish, share or delete only when you ask, and deleting from the CLI needs an explicit --yes.",
  },
];
