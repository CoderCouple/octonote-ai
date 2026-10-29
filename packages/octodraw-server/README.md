# octodraw-server

The server side of octodraw's AI assistant. The browser sends the conversation
(`httpDiagramModel(url)` from `octodraw`); this route calls Claude with the
host's Anthropic key and streams the reply back. The key never reaches the
browser.

It only serves octodraw's own diagram system prompts and caps each request
(40 messages, 400k characters, 5 images under 5 MB), so it can't be used as a
general Claude proxy. Pass `authorize` (your session check), `rateLimit` and `onUsage` (token counts
per answer) to protect and meter it.

## Local development

```bash
cp packages/octodraw-server/.env.example packages/octodraw-server/.env
# put your key in ANTHROPIC_API_KEY
pnpm dev:server   # http://localhost:5181/api/diagram
pnpm dev          # the playground proxies /api to it and switches to Claude automatically
```

## In octonote

The handler uses the Fetch API, so it fits any modern server. Next.js (App Router):

```ts
// app/api/diagram/route.ts
import { createDiagramHandler } from '@octonote/octodraw-server';

const diagrams = createDiagramHandler({
  model: 'claude-opus-5-5',
  // Signed-in users only (null → 401).
  authorize: async (request) => {
    const session = await getSession(request); // octonote's own session lookup
    return session ? { id: session.userId } : null;
  },
  // Per user, in memory per server process (use your own store across instances).
  rateLimit: { requests: 30, windowMs: 60 * 60 * 1000 },
  // Tokens per answer, for quotas or billing.
  onUsage: (u) => recordUsage(u.userId, u.model, u.inputTokens, u.outputTokens),
});

export async function POST(request: Request) {
  return diagrams.handle(request);
}
export const GET = POST; // status: { ok, configured, model }
```

In the browser:

```tsx
import { DiagramChat, httpDiagramModel } from '@octonote/octodraw';

const model = httpDiagramModel('/api/diagram', { credentials: 'same-origin' });
<DiagramChat model={model} figures={figures} onResult={…} />;
```

If octonote passes `instructions` to octodraw (house style, extra icon names),
pass the same string to `createDiagramHandler({ instructions })`; the server
only accepts system prompts it can rebuild itself.
