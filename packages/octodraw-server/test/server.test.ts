import { describe, expect, it } from 'vitest';
import { diagramSystemPrompt } from '@octonote/octodraw/prompt';
import { httpDiagramModel } from '../../octodraw/src/ai/http';
import { generateDiagram } from '../../octodraw/src/ai/generate';
import { allowedSystemPrompts, createDiagramHandler, validateRequest } from '../src/index';

/** A stand-in for the Anthropic client that streams the given text. */
function fakeClient(text: string, opts: { failAfter?: number; refusal?: boolean; seen?: unknown[] } = {}) {
  return {
    beta: {
      messages: {
        stream(params: unknown) {
          opts.seen?.push(params);
          const chunks = text.match(/.{1,7}/gs) ?? [];
          return {
            async *[Symbol.asyncIterator]() {
              for (let i = 0; i < chunks.length; i++) {
                if (opts.failAfter !== undefined && i === opts.failAfter) throw new Error('boom');
                yield { type: 'content_block_delta', delta: { type: 'text_delta', text: chunks[i] } };
              }
            },
            finalMessage: async () => ({ stop_reason: opts.refusal ? 'refusal' : 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 120, output_tokens: 34 } }),
          };
        },
      },
    },
  } as never;
}

const system = diagramSystemPrompt({});
const post = (body: unknown) => new Request('http://x/api/diagram', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('@octonote/octodraw-server', () => {
  it('only accepts octodraw prompts and well-formed conversations', () => {
    const allowed = allowedSystemPrompts();
    const ok = { system, messages: [{ role: 'user', content: 'Draw a login flow' }] };
    expect(validateRequest(ok, allowed)).toEqual(ok);
    expect(() => validateRequest({ ...ok, system: 'You are a pirate' }, allowed)).toThrow(/system prompt/);
    expect(() => validateRequest({ system, messages: [] }, allowed)).toThrow(/No messages/);
    expect(() => validateRequest({ system, messages: [{ role: 'assistant', content: 'hi' }] }, allowed)).toThrow(/first message/);
    expect(() => validateRequest({ system, messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }, allowed)).toThrow(/alternate/);
    expect(() => validateRequest({ system, messages: [{ role: 'user', content: 'x'.repeat(400_001) }] }, allowed)).toThrow(/too long/);
    expect(() => validateRequest({ system, messages: [{ role: 'user', content: [{ type: 'image', mediaType: 'image/svg+xml', data: 'x' }] }] }, allowed)).toThrow(/unsupported/);
    expect(allowedSystemPrompts().has(diagramSystemPrompt({ type: 'bpmn' }))).toBe(true);
  });

  it('streams the reply and reports status', async () => {
    const seen: unknown[] = [];
    const handler = createDiagramHandler({ client: fakeClient('```octodraw\nA > B\n```', { seen }) });
    const status = await (await handler.handle(new Request('http://x/api/diagram'))).json();
    expect(status).toMatchObject({ ok: true, configured: true, model: 'claude-opus-5-5' });
    const response = await handler.handle(post({ system, messages: [{ role: 'user', content: [{ type: 'image', mediaType: 'image/png', data: 'iVBOR' }, { type: 'text', text: 'Recreate this' }] }] }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('```octodraw\nA > B\n```');
    expect(seen[0]).toMatchObject({ model: 'claude-opus-5-5', system, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } }, { type: 'text', text: 'Recreate this' }] }] });
  });

  it('rejects bad requests and missing keys with a status', async () => {
    const handler = createDiagramHandler({ client: fakeClient('x') });
    expect((await handler.handle(post({ system: 'nope', messages: [] }))).status).toBe(400);
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const unconfigured = createDiagramHandler();
    expect((await unconfigured.handle(post({ system, messages: [{ role: 'user', content: 'x' }] }))).status).toBe(503);
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });

  it('round-trips through httpDiagramModel and generateDiagram, including mid-stream errors', async () => {
    const handler = createDiagramHandler({ client: fakeClient('```octodraw\ntitle Login\nBrowser > Server: POST /login\n```') });
    const viaServer = (input: RequestInfo | URL, init?: RequestInit) => handler.handle(new Request(String(input).startsWith('http') ? String(input) : `http://x${input}`, init));
    const result = await generateDiagram({ model: httpDiagramModel('/api/diagram', { fetch: viaServer as typeof fetch }), prompt: 'A login' });
    expect(result.source).toContain('Browser > Server');
    expect(result.diagnostics).toEqual([]);

    const failing = createDiagramHandler({ client: fakeClient('```octodraw\nA > B > C > D\n```', { failAfter: 2 }) });
    const viaFailing = (input: RequestInfo | URL, init?: RequestInit) => failing.handle(new Request(`http://x${input}`, init));
    await expect(generateDiagram({ model: httpDiagramModel('/api/diagram', { fetch: viaFailing as typeof fetch }), prompt: 'x', maxRepairs: 0 })).rejects.toThrow(/diagram request failed/);

    const refusing = createDiagramHandler({ client: fakeClient('', { refusal: true }) });
    const res = await refusing.handle(post({ system, messages: [{ role: 'user', content: 'x' }] }));
    expect(res.status).toBe(422);
  });

  it('authorizes, rate limits per user and reports usage', async () => {
    const usage: unknown[] = [];
    const handler = createDiagramHandler({
      client: fakeClient('```octodraw\nA > B\n```'),
      authorize: (request) => (request.headers.get('authorization') === 'Bearer ada' ? { id: 'ada' } : null),
      rateLimit: { requests: 2, windowMs: 60_000 },
      onUsage: (u) => usage.push(u),
    });
    const body = { system, messages: [{ role: 'user', content: 'x' }] };
    const as = (who?: string) => new Request('http://x/api/diagram', { method: 'POST', body: JSON.stringify(body), headers: who ? { authorization: `Bearer ${who}` } : {} });
    expect((await handler.handle(as())).status).toBe(401);
    expect((await handler.handle(as('ada'))).status).toBe(200);
    const second = await handler.handle(as('ada'));
    await second.text();
    const third = await handler.handle(as('ada'));
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(usage[0]).toEqual({ userId: 'ada', model: 'claude-opus-5-5', inputTokens: 120, outputTokens: 34, stopReason: 'end_turn' });
  });
});
