# octodraw

Diagram-as-code for React, compatible with Eraser's syntax: architecture
diagrams and flowcharts, ERD, sequence and BPMN diagrams, a free-form canvas
that holds several diagrams ("figures"), an AI assistant, real-time
collaboration (Yjs), version history, comments and presentation mode.

## Install

```bash
pnpm build                     # in this repository: builds dist/ for octodraw and octodraw-server
pnpm --filter octodraw pack    # → octodraw-0.0.1.tgz (or publish to a private registry)
```

In the host app: install the tarball (or the registry package) plus its peers,
`react` and `react-dom` (18 or newer).

> The build includes Eraser's icon artwork (a temporary stand-in, see
> `icons/eraser/NOTICE.md`), which has no redistribution licence: use the
> package inside your own product, don't publish it to a public registry.
> Pass `iconSet="open"` to use only the open-source icons.

## Entry points

| Import | What |
|---|---|
| `octodraw` | `OctoCanvas`, `OctoDiagram`, `DiagramChat`, `VersionHistory`, the canvas model functions, export helpers, the AI core (`generateDiagram`, `httpDiagramModel`, attachments) |
| `octodraw/collab` | `useCollaborativeCanvas`, `CanvasSync`, `yjsVersionStore`, `connectBroadcastChannel`, `Y`, `Awareness` |
| `octodraw/prompt` | `diagramSystemPrompt` (pure, for servers) |

The server route for the assistant is the separate `octodraw-server` package.

## Minimal canvas

```tsx
import { OctoCanvas, useCanvasHistory, registerPdfFonts } from 'octodraw';

registerPdfFonts([{ family: 'Inter Variable', weight: 400, url: '/fonts/Inter-Regular.ttf' }]); // optional, for PDF export

export function Board({ initial, onSave }) {
  const { doc, change, undo, redo } = useCanvasHistory(initial);
  return <OctoCanvas doc={doc} onChange={(next, meta) => (change(next, meta), onSave(next))} onUndo={undo} onRedo={redo} style={{ height: '100vh' }} />;
}
```

The document is plain JSON (`{ version: 1, items, comments?, presentation? }`);
store it however you like. Load the fonts the UI uses (Inter, JetBrains Mono;
Patrick Hand for `typeface rough`) in the host page.

## Collaboration

```tsx
import { useCollaborativeCanvas, Awareness, Y, seedCanvas } from 'octodraw/collab';
// Connect ydoc with your provider (y-websocket, Hocuspocus, …), seedCanvas once it has synced.
const live = useCollaborativeCanvas({ ydoc, awareness, user: { id, name } });
<OctoCanvas doc={live.doc} onChange={live.onChange} onUndo={live.undo} onRedo={live.redo} peers={live.peers} onPresenceChange={live.setPresence} />;
```

## AI assistant

```tsx
import { DiagramChat, httpDiagramModel } from 'octodraw';
const model = httpDiagramModel('/api/diagram', { credentials: 'same-origin' });
<DiagramChat model={model} figures={figures} onResult={(result, target) => …} />;
```

The route itself: see `octodraw-server`'s README.
