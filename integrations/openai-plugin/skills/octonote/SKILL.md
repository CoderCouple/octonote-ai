---
name: octonote
description: Write notes, draw diagrams as editable canvases, organise notebooks and publish pages in the user's Octonote workspace. Use when the user mentions Octonote, wants something saved as a note, a diagram drawn, items organised into notebooks, or a page published.
---

# Using Octonote

Octonote keeps the user's **notes** (rich documents), **canvases** (editable diagrams), **projects** (a note and a canvas side by side) and **notebooks** (folders). Everything acts as the signed-in user and is private until they publish or share it.

## Writing notes

Write note content as markdown. Headings, lists, checklists (`- [ ]`), tables, code blocks, quotes, images by URL, `$inline math$`, `$$display math$$` and ` ```mermaid ` diagram blocks all render. Prefer clear headings and short sections; put diagrams that aren't flowcharts or class diagrams (sequence, state, ER, timelines) in the note as ` ```mermaid ` blocks.

## Drawing canvases

Canvases are drawn from a mermaid **flowchart** (`flowchart LR` / `graph TD`) or **class diagram** (`classDiagram`). They become real shapes the user can move and restyle. Keep labels short. To make a box open a page (for example a file on GitHub), add `click NodeId href "https://…"`.

## Organising

Pass a notebook by exact name or id to put new items in it. Use a project when a write-up and a diagram belong together.

## Publishing and sharing

Publishing makes a public web page; sharing invites a person by email; link access lets anyone with the link open an item; delete removes an item. Do these only when the user has asked for that specific action, and confirm what will happen first.

## Replies

Each result includes a link (and a public link once published). Give the user the link so they can open the item.
