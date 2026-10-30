# Backlog

Known gaps and deferred work. Add an item whenever something is left out,
skipped or postponed; tick it (or delete it) when it lands. Big themes live in
ROADMAP.md; this is the checklist of loose ends.

## Diagram types
- [ ] BPMN: no drill-down/collapse/Maps; no expanded subprocesses; elements can't be dragged to another lane (that changes the code); lines leaving a boundary event can cross its task.

## Element toolbar: ERD and sequence
- [ ] ERD: columns (name, type, pk/fk) aren't selectable or editable from the toolbar; only tables and relationships.
- [ ] ERD: a table used as `table.column` can't be renamed to a name with spaces or `< > [ ] { } : ,` (a quoted name can't take `.column`); the toolbar refuses with a reason.
- [ ] ERD: "Key columns only" is view state (like the header chevron), not saved with the figure.
- [ ] Sequence: blocks (alt / loop / opt / par / break), their labels and activations aren't selectable yet.
- [ ] Sequence: several selected messages get Colour and Line but no Direction (it is named per message); a return can't point both ways and a two-way message can't be a return (refused with a reason).
- [ ] Rewrites always write connectors spaced (`a.id<b.id` becomes `a.id < b.id` when its cardinality changes).

## Rendering
- [ ] `watercolor`: PDF export may drop the SVG filters.
- [ ] PDF fonts: hosts must register TTF files (`registerPdfFonts`); weights the host doesn't register fall back to Helvetica.

## Icons
- [ ] Cisco icons not imported (vendor pack is JPG/Visio/PDF only; needs SVGs).
- [ ] Missing vendor matches: AWS 392/436, Azure 615/618 matched.
- [ ] Serve icon catalogues from a CDN (deferred; keep vendor/Eraser icons private).
- [ ] Replace Eraser's artwork (temporary stand-in) with licensed vendor packs.

## Verification
- [ ] 20-image comparison against Eraser: needs Eraser renders for corpus 08–20.

## AI
- [ ] Not yet run against the real Claude API: put a key in packages/octodraw-server/.env and run `pnpm dev:server` (the route, adapter and streaming are tested with a fake client).
- [ ] Server route rate limiting is in memory per process; multi-instance deployments need a shared store (pass `authorize` and do it there).
- [ ] Attachments: folders, .zip archives and GitHub repositories (public, or private with `githubToken`; 40 files / 300k chars, ranked); other hosts (GitLab, Bitbucket) no; the unauthenticated GitHub API allows 60 requests an hour; images over 5 MB are rejected; attachments aren't kept in saved conversations (names only).

## Canvas (step 6 follow-ups)
- [ ] ERD/sequence: no filters (Maps-style) yet. Details panels show only in opened figures at least 640 wide.
- [ ] Off-screen figures are parked as placeholders; a parked auto-size figure sizes itself only when it comes near the view.
- [ ] Rotation: figures and lines don't rotate; snapping is off while resizing a turned item.
- [ ] Images from other sites may block PNG export (canvas tainting).
- [ ] Mobile: the tool rail scrolls sideways on narrow screens; pinch zoom (canvas and full-screen figures) only tested with synthetic touches; nothing tried on a real phone yet.
- [ ] Comments: notifications are sent by the host through onMention.
- [ ] Pinch zoom is untested on a real touch device (only the logic is in place).
- [ ] Image upload: the playground keeps images inline (data URLs) and moves big canvases to IndexedDB; hosts should pass `onUploadImage` to store images properly.
- [ ] Hand placement: resizing icon nodes isn't possible; sequence diagrams only reorder participants (messages follow the code order).
- [ ] Standalone OctoDiagram keeps placements in memory unless the host passes `placements` / `onPlacementsChange`.
- [ ] Code edits in the editor aren't canvas undo steps (they're "silent"); Monaco's own undo covers them.

## Presentation
- [ ] Presenter view is a popup window: browsers may block it or leave full screen when it opens; the next-slide thumbnail draws figures from code (no drill/collapse state).

## Roadmap steps still to do
- [ ] 5. AI: finish the items under "AI" above.
- [ ] 6. Free-form canvas and figures: finish the canvas follow-ups above.
- [ ] 7. Collaboration: finish the items under "Collaboration" below.

## Collaboration (step 7 follow-ups)
- [ ] Server provider in octonote (y-websocket or Hocuspocus), auth per document, persistence; only the BroadcastChannel demo provider is built in.
- [ ] Versions are full document copies (no deltas); the Y.Doc store grows with each one, use a host database for long histories. Previews highlight added/edited items and ghost removed ones.
- [ ] Hidden tabs re-render figures only when visible (rAF throttling); fine for people, odd for automated tests.
