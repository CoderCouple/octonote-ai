import Anthropic from '@anthropic-ai/sdk';
import { diagramSystemPrompt } from '@octonote/octodraw/prompt';

// The server side of octodraw's AI: receives the conversation the browser's
// `httpDiagramModel` sends, calls Claude with the host's key, and streams the
// reply text back. Written against the Fetch API (Request/Response), so it
// drops into Next.js route handlers, Hono, Remix, Vercel/Cloudflare functions
// or the small Node server in dev.ts.
//
// It only runs octodraw's own system prompts and caps what a request may
// contain, so the endpoint can't be used as a general-purpose Claude proxy.
// Authentication and rate limiting belong to the host (wrap `handle`).

export const DEFAULT_MODEL = 'claude-opus-5-5';

type ContentPart = { type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string };
export interface DiagramMessage {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
}
export interface DiagramRequestBody {
  system: string;
  messages: DiagramMessage[];
}

export interface DiagramHandlerOptions {
  /** Defaults to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  model?: string;
  /** Extra instructions the host's browser code passes to octodraw (`instructions`); must match exactly. */
  instructions?: string;
  maxTokens?: number;
  /** Origins allowed to call from a browser on another origin (CORS); same-origin needs none. */
  allowedOrigins?: string[];
  /** Inject a client (tests, proxies, Bedrock/Vertex clients with the same interface). */
  client?: Pick<Anthropic, 'beta'>;
  /** Who is asking: return the user (signed in) or null to answer 401. Omit to allow everyone. */
  authorize?: (request: Request) => DiagramUser | null | Promise<DiagramUser | null>;
  /** Requests allowed per user (or per client address when there's no user) in a sliding window; in memory, per process. */
  rateLimit?: { requests: number; windowMs: number };
  /** Called after each answer with the tokens used, for billing or quotas. */
  onUsage?: (usage: DiagramUsage) => void;
}

export interface DiagramUser {
  id: string;
}

export interface DiagramUsage {
  userId?: string;
  /** The model that answered (a fallback model if the first declined). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

const LIMITS = { messages: 40, chars: 400_000, images: 5, imageBytes: 5 * 1024 * 1024 };
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export class DiagramRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** The system prompts octodraw sends: all diagram types or one, with the host's instructions. */
export function allowedSystemPrompts(instructions?: string): Set<string> {
  const types = [undefined, 'flow', 'erd', 'sequence', 'bpmn'] as const;
  return new Set(types.map((type) => diagramSystemPrompt({ type, instructions })));
}

/** Checks a request body; throws DiagramRequestError with a reason when it isn't one octodraw sends. */
export function validateRequest(body: unknown, allowed: Set<string>): DiagramRequestBody {
  if (!body || typeof body !== 'object') throw new DiagramRequestError('Expected a JSON object');
  const { system, messages } = body as Partial<DiagramRequestBody>;
  if (typeof system !== 'string' || !allowed.has(system)) throw new DiagramRequestError('Unknown system prompt (only octodraw diagram prompts are served)');
  if (!Array.isArray(messages) || messages.length === 0) throw new DiagramRequestError('No messages');
  if (messages.length > LIMITS.messages) throw new DiagramRequestError(`At most ${LIMITS.messages} messages`);
  let chars = 0;
  let images = 0;
  messages.forEach((m, i) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) throw new DiagramRequestError(`Message ${i + 1}: role must be user or assistant`);
    if (i === 0 && m.role !== 'user') throw new DiagramRequestError('The first message must be from the user');
    if (i > 0 && m.role === messages[i - 1]!.role) throw new DiagramRequestError('Messages must alternate between user and assistant');
    const parts = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : m.content;
    if (!Array.isArray(parts)) throw new DiagramRequestError(`Message ${i + 1}: content must be text or parts`);
    for (const part of parts) {
      if (part?.type === 'text' && typeof part.text === 'string') chars += part.text.length;
      else if (part?.type === 'image' && m.role === 'user' && typeof part.data === 'string' && IMAGE_TYPES.has(part.mediaType)) {
        images++;
        if (part.data.length * 0.75 > LIMITS.imageBytes) throw new DiagramRequestError('Images must be under 5 MB');
      } else throw new DiagramRequestError(`Message ${i + 1}: unsupported content`);
    }
  });
  if (messages.at(-1)!.role !== 'user') throw new DiagramRequestError('The last message must be from the user');
  if (chars > LIMITS.chars) throw new DiagramRequestError('The conversation is too long');
  if (images > LIMITS.images) throw new DiagramRequestError(`At most ${LIMITS.images} images`);
  return { system, messages };
}

/** octodraw's messages in the Messages API shape (images as base64 image blocks). */
function toClaude(messages: DiagramMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === 'string'
        ? m.content
        : m.content.map((part) =>
            part.type === 'text'
              ? { type: 'text' as const, text: part.text }
              : { type: 'image' as const, source: { type: 'base64' as const, media_type: part.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: part.data } },
          ),
  }));
}

export function createDiagramHandler(options: DiagramHandlerOptions = {}) {
  const model = options.model ?? DEFAULT_MODEL;
  const allowed = allowedSystemPrompts(options.instructions);
  const configured = !!(options.client || options.apiKey || process.env.ANTHROPIC_API_KEY);
  let client = options.client;
  const getClient = () => (client ??= new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY }));

  // Sliding-window request log per user / address.
  const hits = new Map<string, number[]>();
  const limited = (key: string): number => {
    const limit = options.rateLimit;
    if (!limit) return 0;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < limit.windowMs);
    if (recent.length >= limit.requests) {
      hits.set(key, recent);
      return Math.ceil((recent[0]! + limit.windowMs - now) / 1000);
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, times] of hits) if (!times.some((t) => now - t < limit.windowMs)) hits.delete(k);
    return 0;
  };

  /** Streams Claude's reply text for a validated request. */
  async function* stream(body: DiagramRequestBody, signal?: AbortSignal, user?: DiagramUser): AsyncIterable<string> {
    const response = getClient().beta.messages.stream(
      {
        model,
        max_tokens: options.maxTokens ?? 32000,
        // On a safety decline, the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: body.system,
        messages: toClaude(body.messages),
      },
      { signal },
    );
    for await (const event of response) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
    }
    const final = await response.finalMessage();
    options.onUsage?.({ userId: user?.id, model: final.model, inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, stopReason: final.stop_reason });
    if (final.stop_reason === 'refusal') throw new DiagramRequestError('Claude declined this request.', 422);
  }

  const cors = (request: Request): Record<string, string> => {
    const origin = request.headers.get('origin');
    if (!origin || !options.allowedOrigins?.includes(origin)) return {};
    return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' };
  };
  const json = (request: Request, status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(request) } });

  /** GET: health/status. POST: { system, messages } → streamed text/plain reply. */
  async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (request.method === 'GET') return json(request, 200, { ok: true, configured, model });
    if (request.method !== 'POST') return json(request, 405, { error: 'Use POST' });
    if (!configured) return json(request, 503, { error: 'The server has no ANTHROPIC_API_KEY configured' });
    let user: DiagramUser | null = null;
    if (options.authorize) {
      user = await options.authorize(request);
      if (!user) return json(request, 401, { error: 'Sign in to use the diagram assistant' });
    }
    const wait = limited(user?.id ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous');
    if (wait) {
      const response = json(request, 429, { error: `Too many diagram requests. Try again in ${wait}s.` });
      response.headers.set('retry-after', String(wait));
      return response;
    }
    let body: DiagramRequestBody;
    try {
      body = validateRequest(await request.json().catch(() => null), allowed);
    } catch (error) {
      return json(request, error instanceof DiagramRequestError ? error.status : 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }

    // Start the call before answering, so setup errors (bad key, rate limit) get a proper status.
    const iterator = stream(body, request.signal, user ?? undefined)[Symbol.asyncIterator]();
    let first: IteratorResult<string>;
    try {
      first = await iterator.next();
    } catch (error) {
      const { status, message } = describeError(error);
      return json(request, status, { error: message });
    }
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        else controller.close();
      },
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(next.value));
        } catch (error) {
          // Headers are sent: report the failure in-band so the client can show it.
          controller.enqueue(encoder.encode(`\n\n[octodraw-error] ${describeError(error).message}`));
          controller.close();
        }
      },
      cancel() {
        void iterator.return?.();
      },
    });
    return new Response(readable, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...cors(request) } });
  }

  return { handle, stream, model, configured };
}

/** A status and a message safe to show users (no key material, no stack). */
export function describeError(error: unknown): { status: number; message: string } {
  if (error instanceof DiagramRequestError) return { status: error.status, message: error.message };
  if (error instanceof Anthropic.AuthenticationError) return { status: 502, message: 'The server’s Anthropic API key was rejected.' };
  if (error instanceof Anthropic.RateLimitError) return { status: 429, message: 'Rate limited by the Anthropic API. Try again in a moment.' };
  if (error instanceof Anthropic.APIError && error.status) return { status: 502, message: `Anthropic API error ${error.status}` };
  if (error instanceof Error && error.name === 'AbortError') return { status: 499, message: 'Cancelled' };
  return { status: 500, message: 'The diagram request failed.' };
}
