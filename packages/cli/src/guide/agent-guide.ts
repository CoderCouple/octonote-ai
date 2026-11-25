/**
 * The guide agents read — one source for `octonote guide`, the section
 * `octonote setup` writes into CLAUDE.md / AGENTS.md, and the Claude Code
 * skill. Keep it short and task-first: agents act on the first screen.
 */

/** Short pointer for CLAUDE.md / AGENTS.md (the full guide is one command away). */
export const PROJECT_SECTION = `## Octonote (notes & canvases)

The user keeps notes, diagrams (canvases), projects, notebooks and presentations in Octonote. Use the \`octonote\` CLI to read and write them — never ask the user to copy-paste.

- Run \`octonote guide\` once per session before using it; \`octonote <command> --help\` for details.
- Write notes as markdown files (mermaid, \`$math$\`, code and tables work); draw diagrams as mermaid flowcharts or class diagrams (\`--from-mermaid\`), which become real, editable canvases.
- Output is JSON when piped: read \`id\`, \`url\` and \`publicUrl\` from it, and always give the user the link.
- Only publish, share or delete when the user asked to.
`;

export const AGENT_GUIDE = `# Octonote CLI — guide for agents

Octonote holds the user's **notes** (markdown documents), **canvases** (diagrams),
**projects** (one note + one canvas, side by side), **notebooks** (folders) and
**presentations** (slides that hold any note block).
The \`octonote\` CLI is how you read and write them on the user's behalf.

## Rules
- Output is JSON when piped (force with --json). Errors print
  \`{"error":{"code","message","hint"}}\` and exit non-zero; branch on \`code\`.
- Never prompts. Content comes from --file <path>, --stdin, or "-" as the path.
- Every result has \`id\`, \`url\` (app link) and, once published, \`publicUrl\`.
  Give the user the link at the end.
- Ids carry their kind: pag_ note, cnv_ canvas, prj_ project, ntb_ notebook,
  dck_ presentation.
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
Live interactive blocks: a fence named after the kind holding JSON, e.g.
\`\`\`quiz {"questions":[…]} \`\`\`. Kinds: widget (sliders, formulas, charts),
infographic (key facts as cards, steps, stats, compare, timeline or bars),
flashcards, mcq, quiz, mindmap, matching, scene (animation), custom (sandboxed
HTML app). An invalid block is refused with the reason; fix it and retry.
Use the built-in kind whenever one fits, never custom: a mind map is a
\`\`\`mindmap block ({"nodes":[{"id","label","parent"?,"note"?}]}), a quiz a
\`\`\`quiz. Built-in blocks get every design and feature update; a custom app
stays exactly as written. Custom is only for a bespoke game or tool no kind covers.

## Read and edit a note
  octonote note show <id>                 # markdown to stdout
  octonote note pull <id> -o note.md      # file with front matter (keeps the id)
  # …edit note.md…
  octonote note push note.md              # replaces the note's content
  octonote note append <id> --text "- new item"   # or --file / --stdin
  octonote note rename <id> "New title"

## Draw a canvas (diagram)
Write a mermaid **flowchart** or **class diagram** and let Octonote lay it out
as real shapes:
  octonote canvas create "Login flow" --from-mermaid flow.mmd [--publish]
  octonote canvas redraw <id> --from-mermaid flow.mmd
Flowcharts: \`graph|flowchart TD|LR|BT|RL\`; nodes A[box] A(round) A([stadium])
A((circle)) A{decision} A[(database)] A{{hexagon}}; edges --> --- -.-> ==> <-->
with labels (A -->|yes| B or A -- yes --> B); chains; A & B --> C;
\`subgraph id [Title] … end\`.
Class diagrams: \`classDiagram\`; \`class A { +field / +method() }\`, \`A : +member\`,
\`<<interface>>\`, generics A~T~, relations <|-- *-- o-- --> ..> ..|> -- with
"1"/"*" cardinalities and \`: label\`, \`namespace N { … }\`.
Links: \`click A href "https://…"\` makes a box open that page (canvases and
note diagrams alike) — point code boxes at the file and line on GitHub.
Other diagram types (sequence, state, ER, gantt…) can't be canvases — put
them in a note as a \`\`\`mermaid block instead.
Read one: \`octonote canvas show <id>\` gives its figures (with their source), words and connections.
Raw canvas JSON also works: \`canvas pull <id> -o c.json\` / \`canvas push c.json --id <id>\`.
It's \`{ "version": 1, "items": [...] }\`; items are shape (rectangle|ellipse|diamond,
text), sticky, text, line (start/end {x,y,item?}, startArrow, endArrow, dashed, text),
frame, code, image, icon, pen and figure, each with x, y, w, h.

## Project = note + canvas
  octonote project create "Auth flow" --note auth.md --canvas-mermaid auth.mmd \\
    [--view split|notes|canvas] [--notebook "Name"] [--publish]
  octonote project show <id>     # JSON: ids of its note and canvas (edit them as above)

## Presentations (slides)
Make slides from something that exists (the original stays as it is):
  octonote deck from <pag_|prj_|ntb_ id> [--split heading|divider] [--keep-text] [--group-blocks] [--publish]
  octonote deck from <id> --ai            # AI plans the slides (uses the AI allowance; only when asked)
A note splits at its H1/H2 headings (or at --- dividers): text on the left, the
section's block on the right; paragraphs move to the presenter notes unless
--keep-text. A project adds a slide per canvas frame or figure; a notebook a
section per item.
Or write them as slide markdown — a line of --- between slides, a line of ???
before that slide's presenter notes, any note block (quiz, widget, mermaid,
maths…) on a slide:
  octonote deck create "Talk" --file talk.md [--notebook "Name"] [--publish]
Layouts follow the content: a lone heading is a title or section slide, text
with a block is text-and-block, a block alone fills the slide.
  octonote deck show <id>                 # outline: each slide's title, objects, clicks, notes
  octonote deck pull <id> -o deck.json    # raw JSON → edit → push back. Version 2: each slide has
  octonote deck push deck.json --id <id>  #   elements (text|block|image|shape|canvas at x,y,w,h on
                                          #   960×540) and animations (in|emphasis|out; click|with|after)
Presenting is done in the app (Present, presenter view); give the user the link.

## Organise
  octonote list [--kind note|canvas|project|notebook] [--notebook "Name"]
  octonote search <words>                 # by title
  octonote notebook list | create "Name" | show "Name"   # show lists what's inside
  octonote rename <id> "New name"         # any note, canvas, project, notebook or presentation
  octonote move <id> --notebook "Name"    # or --out
  octonote delete <id> --yes

## Publish and share
  octonote publish <id>        # → publicUrl (a public, read-only page)
  octonote unpublish <id>
  octonote publish fig_…       # one canvas figure by itself; its canvas stays private
  octonote share <id> --email person@example.com --role viewer|editor   # again to change a role
  octonote share <id> --link view|edit|off   # anyone with the app link
  octonote access <id>         # who can open it, the link setting, published or not
  octonote unshare <id> --email person@example.com
  octonote shared              # what others shared with the user
Publishing a notebook publishes everything inside it.

## Collections (clips → a cited note)
A collection (clc_…) holds clips (clp_…): passages from AI chats, the web or
anywhere, in order. Composing writes one note from only those clips, with
every sentence cited to its clip.
  octonote collection list | show <id> | create "Name" | rename <id> "Name"
  octonote clip add <collection> --text "…" [--source-url <url> --source-title "…"]   # or --file / --stdin
  octonote clip edit <clip> --text "…"  |  octonote clip rm <clip>
  octonote collection order <collection> <clip> <clip>…
  octonote collection compose <collection> --mode summary|report|comparison|study_notes|outline|faq|article|brief|flashcards|custom \\
    [--instructions "…"] [--title "…"] [--save [--notebook "Name"]]
compose prints the draft (and any sentence the clips don't fully support);
--save makes it a note and returns its link.

## Make things with AI
These use the user's AI allowance: run them when the user asks for
AI-made content. Writing a note yourself (note create) costs nothing.
  octonote generate "explain backpropagation, with a quiz" [--notebook "Name"]   # → a new note
  octonote studio create --kind mindmap|flashcards|quiz|mcq|matching|infographic|text \\
    (--text "…" | --file f.txt | --url <url> | --from <note id> | --pdf f.pdf) --wait
  octonote studio list | show <id> | retry <id> --wait | add-to-note <id> [--note <id>]
  octonote studio publish <id>        # → publicUrl
  octonote video create "how attention works" [--portrait] [--note <id>] [--wait]
  octonote video show <id> [--wait]   # progress, then its link and chapters
A video takes several minutes. With --note it goes into the note at once and
shows its progress there; or add it yourself as \`\`\`video {"videoId":"vid_…"} \`\`\`.

## Pictures and files
  octonote canvas image <canvas|project> -o diagram.png
  octonote figure list [--canvas <id>] | show <fig> | download <fig> -o fig.png
  octonote note export <id> -o note.md    # same as note pull

## What changed
  octonote recent                         # what the user edited lately
  octonote activity [--item <id>] [--limit 50]

## Account
  octonote whoami | workspace list | workspace use <name|id> | logout
  octonote account rename "Full Name"     # display name (author on published pages)
`;

/** Claude Code skill file (.claude/skills/octonote/SKILL.md). */
export const CLAUDE_SKILL = `---
name: octonote
description: Read and write the user's Octonote notes, canvases (diagrams), projects and notebooks with the octonote CLI — create notes from markdown, draw diagrams from mermaid flowcharts, publish and share them. Use when the user mentions Octonote, their notes or notebooks, or asks to document, diagram, write up or publish something there.
---

${AGENT_GUIDE}`;
