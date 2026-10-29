import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createDiagramHandler } from './index.ts';

// Local server for the diagram route: POST /api/diagram (GET for status).
// The playground's Vite dev server proxies /api here. Reads ANTHROPIC_API_KEY
// from the environment or packages/octodraw-server/.env.

const port = Number(process.env.PORT) || 5181;
const handler = createDiagramHandler({
  model: process.env.OCTODRAW_MODEL || undefined,
  allowedOrigins: process.env.OCTODRAW_ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean),
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/api/diagram') {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  // Node request → Fetch Request (aborted if the browser goes away).
  const controller = new AbortController();
  res.on('close', () => !res.writableFinished && controller.abort());
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: 'half',
    signal: controller.signal,
  } as RequestInit);
  const response = await handler.handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}).listen(port, () => {
  console.log(`octodraw diagram server on http://localhost:${port}/api/diagram (${handler.configured ? `model ${handler.model}` : 'no ANTHROPIC_API_KEY set: requests will get 503'})`);
});
