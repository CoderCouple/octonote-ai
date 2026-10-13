/**
 * The guide agents read — one source for `octonote guide`, the section
 * `octonote setup` writes into CLAUDE.md / AGENTS.md, and the Claude Code
 * skill. Keep it short and task-first: agents act on the first screen.
 */

/** Short pointer for CLAUDE.md / AGENTS.md (the full guide is one command away). */
export const PROJECT_SECTION = `## Octonote (notes & canvases)

The user keeps notes, diagrams (canvases), projects and notebooks in Octonote. Use the \`octonote\` CLI to read and write them — never ask the user to copy-paste.

- Run \`octonote guide\` once per session before using it; \`octonote <command> --help\` for details.
- Write notes as markdown files (mermaid, \`$math$\`, code and tables work); draw diagrams as mermaid flowcharts (\`--from-mermaid\`), which become real, editable canvases.
- Output is JSON when piped: read \`id\`, \`url\` and \`publicUrl\` from it, and always give the user the link.
- Only publish, share or delete when the user asked to.
`;

export const AGENT_GUIDE = `# Octonote CLI — guide for agents

Octonote holds the user's **notes** (markdown documents), **canvases** (diagrams),
**projects** (one note + one canvas, side by side) and **notebooks** (folders).
The \`octonote\` CLI is how you read and write them on the user's behalf.

## Rules
- Output is JSON when piped (force with --json). Errors print
  \`{"error":{"code","message","hint"}}\` and exit non-zero; branch on \`code\`.
- Never prompts. Content comes from --file <path>, --stdin, or "-" as the path.
- Every result has \`id\`, \`url\` (app link) and, once published, \`publicUrl\`.
  Give the user the link at the end.
- Ids carry their kind: pag_ note, cnv_ canvas, prj_ project, ntb_ notebook.
  Notebooks can also be named by exact name (--notebook "Architecture").
- Publish, share, invite or delete only when the user asked for it.
  \`delete\` requires --yes.
- Not signed in (code NOT_LOGGED_IN)? Ask the user to run \`octonote login\`
  (or set OCTONOTE_TOKEN). Don't try to sign in yourself.

## Write a note
  octonote note create "Title" --file doc.md [--notebook "Name"] [--publish]
  cat doc.md | octonote note create "Title" --stdin
Markdown → rich note: headings, lists, checklists, tables, code, quotes,
images (by URL), \`$inline math$\`, \`$$display math$$\`, and \`\`\`mermaid blocks
(rendered diagrams inside the note).

## Read and edit a note
  octonote note show <id>                 # markdown to stdout
  octonote note pull <id> -o note.md      # file with front matter (keeps the id)
  # …edit note.md…
  octonote note push note.md              # replaces the note's content
  octonote note append <id> --text "- new item"   # or --file / --stdin
  octonote note rename <id> "New title"

## Draw a canvas (diagram)
Write a mermaid **flowchart** and let Octonote lay it out as real shapes:
  octonote canvas create "Login flow" --from-mermaid flow.mmd [--publish]
  octonote canvas redraw <id> --from-mermaid flow.mmd
Supported: \`graph|flowchart TD|LR|BT|RL\`; nodes A[box] A(round) A([stadium])
A((circle)) A{decision} A[(database)] A{{hexagon}}; edges --> --- -.-> ==> <-->
with labels (A -->|yes| B or A -- yes --> B); chains; A & B --> C;
\`subgraph id [Title] … end\`. Other diagram types (sequence, gantt…) can't be
canvases — put them in a note as a \`\`\`mermaid block instead.
Raw tldraw JSON also works: \`canvas pull <id> -o c.json\` / \`canvas push c.json --id <id>\`.

## Project = note + canvas
  octonote project create "Auth flow" --note auth.md --canvas-mermaid auth.mmd \\
    [--view split|notes|canvas] [--notebook "Name"] [--publish]
  octonote project show <id>     # ids of its note and canvas (edit them as above)

## Organise
  octonote list [--kind note|canvas|project|notebook] [--notebook "Name"]
  octonote search <words>                 # by title
  octonote notebook list | create "Name" | show "Name"
  octonote move <id> --notebook "Name"    # or --out
  octonote delete <id> --yes

## Publish and share
  octonote publish <id>        # → publicUrl (a public, read-only page)
  octonote unpublish <id>
  octonote share <id> --email person@example.com --role viewer|editor
  octonote share <id> --link view|edit|off   # anyone with the app link
Publishing a notebook publishes everything inside it.

## Account
  octonote whoami | workspace list | workspace use <name|id> | logout
`;

/** Claude Code skill file (.claude/skills/octonote/SKILL.md). */
export const CLAUDE_SKILL = `---
name: octonote
description: Read and write the user's Octonote notes, canvases (diagrams), projects and notebooks with the octonote CLI — create notes from markdown, draw diagrams from mermaid flowcharts, publish and share them. Use when the user mentions Octonote, their notes or notebooks, or asks to document, diagram, write up or publish something there.
---

${AGENT_GUIDE}`;
