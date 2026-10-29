# octodraw roadmap

Capability parity with Eraser, in build order. ✅ done · 🟡 partial · ⬜ not started.

**Eraser is a reference for *what* to build, not *how it looks*.** We stay compatible with its
diagram-as-code syntax and icon names, but octodraw's interaction design — toolbars, menus,
palettes, labels, shortcuts — is our own, designed for octonote with octodraw's design tokens.
The Eraser screenshots shared on 2026-10-26 list the capabilities it offers; the items below
describe the capability, with Eraser's version noted only for comparison.

## 1. Diagram-as-code language parity ✅
- ✅ All 11 flow chart shapes (rectangle, cylinder, diamond, document, ellipse, hexagon, oval, parallelogram, star, trapezoid, triangle); arrows attach to true outlines
- ✅ `legend { … }` rendered, all 8 positions, connection/color/icon/shape swatches
- ✅ `link:` clickable (badge; http(s) opens a tab, hosts handle other schemes via `onLinkClick`)
- ✅ `typeface clean | mono | rough` (rough = hand-drawn face), diagram-wide and per node
- ✅ Unknown property values warn (e.g. `shape: blob`)
- ✅ `styleMode watercolor`

## 2. Export and copy ✅
- ✅ Download PNG (2×, web fonts embedded), SVG (fonts embedded), PDF, Eraser JSON and Eraser XML
- ✅ Copy PNG / SVG / JSON / XML to the clipboard
- ✅ Link / Markdown / HTML embed snippets when the host passes `share={{ url, imageUrl }}`
- ✅ `ref` handle for hosts: `exportSvg`, `exportPng`, `exportPdf`, `exportJson`, `exportXml`, `download`, `copy`; `renderDiagramSvg` works server-side
- ✅ Export a *selection* (canvas export menu)
- ⬜ PDF with embedded web fonts (jsPDF falls back to its standard fonts)

## 3. Maps 🟡
- ✅ Flows: `flow Name { A > B: caption … }` (octodraw extension) with a player — pick a flow, play/pause, step with ‹ › or arrow keys; current step accented, walked path lit, the rest dimmed; works at any drill/collapse level
- ✅ Filter by `team:` / `tech:` / `tags:` (octodraw extensions): toolbar menu, removable chips, non-matching boxes dimmed
- ✅ Details panel on click: description, ancestry, properties, incoming/outgoing connections (clickable); host hooks `onSelect`, `renderDetails`
- ✅ Drill down, breadcrumbs, externals; collapse/expand groups and Collapse all
- ⬜ Step through time (current → target states)
- ⬜ Live sync from external sources (cloud accounts, CMDB) — would come through octonote

## 4. More diagram types 🟡
- ✅ ERD (Eraser syntax): tables with typed columns and PK/FK badges, column-to-column relationships, `notation chen | crows-feet`, cardinality from `<` `>` `-` `<>`
- ✅ Sequence (Eraser syntax): participants with icons/colors, six arrow types, `activate`/`deactivate`, `loop` / `alt`+`else` / `opt` / `par`+`and` / `break` blocks, `autoNumber on | nested`
- ✅ Diagram type detected from the code (`type` prop to override); export PNG/SVG/PDF for every type
- ✅ BPMN (Eraser's swimlane syntax): pools, lanes, activities, events, gateways
- ✅ ERD/sequence/BPMN draw-in; ERD table focus and collapse; sequence step-through

## 5. AI 🟡
- ✅ Model-agnostic core: system prompt, `generateDiagram` (stream, extract, validate, one repair round), `validateDiagram`
- ✅ `DiagramChat` panel: figure references as chips (`@` to attach), starters per diagram type, chat history, stop; `OctoDiagram` `onAskAi` button
- ✅ Playground: demo model, or Claude with a personal key; result plays with `drawIn`
- ✅ Code / Terraform / Kubernetes / schemas / images → diagram (attachments)

## 6. Free-form canvas and figures 🟡
- ✅ `OctoCanvas`: infinite canvas, tool rail with single-key shortcuts (select, pan, rectangle, ellipse, diamond, arrow, line, pen, text), icons, undo/redo
- ✅ Insert palette (⌘K or /): diagram templates, shapes, icon search, "draw with AI"
- ✅ **Figures**: diagrams as objects, several per canvas, each a full embedded `OctoDiagram` (own code, drill-down, collapse, flows, draw-in); open with double-click/Enter
- ✅ Selection: click, shift-click, marquee; move, resize, nudge; selection toolbar (code, open, Ask AI, color, arrows/dash, arrange, duplicate, delete); layer order; copy/cut/paste (paste diagram code → figure)
- ✅ Arrows attach to items and follow them
- ✅ Sticky notes, text formatting, images (upload, paste, drop), device frames (phone, tablet, browser, desktop; carry their contents), code blocks
- ✅ Comments (pins on items or the canvas, threads, resolve), snapping with alignment guides, multi-selection resize, pinch zoom
- ✅ "To diagram": turn hand-drawn boxes and arrows into a figure with code; export the canvas or selection as PNG/SVG
- ✅ Templates gallery (whole starter boards on an empty canvas and in the palette) and rotation (handle, ⇧R, groups turn about their centre)
- ✅ Move nodes and resize groups/cards by hand (placements stored next to the code, per drill level; Reset layout)

## 7. Collaboration (with octonote) ✅ (library side; octonote supplies the server)
- ✅ Real-time editing (Yjs, `octodraw/collab`): per-item, per-field merging; figure code typed together (Y.Text); per-user undo
- ✅ Presence: live cursors, coloured selection outlines with names (`peers` / `onPresenceChange`)
- ✅ Playground "Go live": tabs of one browser share a room (BroadcastChannel); octonote plugs in a server provider
- ✅ Comments (canvas tool [C] and on selections) — single-user; shared threads come with real-time sync
- ✅ Version history: named and automatic versions, preview read-only, restore (a normal, undoable, synced edit); stores for localStorage, the shared Y.Doc, or the host's database
- ✅ Merging comment replies and label text; follow a collaborator's view; collaborators' carets in the code editor
- ⬜ Collaborative editing of single diagrams outside the canvas (standalone `OctoDiagram` + editor)

## Presentation ✅
- ✅ Slides panel (reorder, hide, speaker notes), notes while presenting, laser pointer seen by collaborators, presenter view in a second window
- ✅ Present the canvas: figures and frames as slides in reading order, full screen, gliding camera, draw-in on arrival, keyboard and swipe navigation; collaborators can follow the presenter

## Later
- ⬜ Serve icons per-file from a CDN instead of lazy bundles (deferred by decision)
- ⬜ Cisco vendor icons (need SVG/draw.io source)
- ⬜ Eraser corpus comparison for examples 08–20 (needs Eraser outputs)
