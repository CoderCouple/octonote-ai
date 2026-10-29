import Anthropic from '@anthropic-ai/sdk';
import { messageText, type DiagramModel, type ModelMessage } from '@octonote/octodraw';
import { EXAMPLES } from './examples';

// Model adapters for the playground. A real host (octonote) calls the model
// from its server so keys never reach the browser; the direct Claude call
// below exists only so the playground can be tried with a personal key.

export const CLAUDE_MODEL = 'claude-opus-5-5';

/** octodraw's messages in the Messages API shape (images as base64 image blocks). */
function toClaude(messages: ModelMessage[]): Anthropic.Beta.BetaMessageParam[] {
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

/** Streams Claude's reply straight from the browser with the user's own key. */
export function claudeModel(apiKey: string): DiagramModel {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return async function* ({ system, messages, signal }) {
    try {
      const stream = client.beta.messages.stream(
        {
          model: CLAUDE_MODEL,
          max_tokens: 32000,
          // On a safety decline, the API retries on a fallback model in the same call.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system,
          messages: toClaude(messages),
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new Error('The Anthropic API key was rejected. Check it in the assistant settings.');
      if (error instanceof Anthropic.RateLimitError) throw new Error('Rate limited by the Anthropic API. Try again in a moment.');
      if (error instanceof Anthropic.APIError && error.status) throw new Error(`Anthropic API error ${error.status}: ${error.message}`);
      throw error;
    }
  };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

/** Picks a canned example by keyword so the chat can be tried without a key. */
export const demoModel: DiagramModel = async function* ({ messages, signal }) {
  const last = messages.at(-1)?.content ?? '';
  const request = messageText(last);
  const editing = /^Figure to edit: "[^"]*"\n```octodraw\n([\s\S]*?)\n```/.exec(request);
  const ask = request.toLowerCase();
  let code: string;
  let note: string;
  if (editing) {
    code = editing[1]!;
    note = "Demo mode can't make real edits, so the figure is unchanged. Add an Anthropic API key below to use Claude.";
  } else {
    const pick = /attached file "[^"]*" \(sql schema|create table/.test(ask) ? 'ERD: e-commerce' : /sequence|login|oauth|calls/.test(ask) ? 'Sequence: checkout' : /data model|erd|table|schema|entity/.test(ask) ? 'ERD: e-commerce' : /flowchart|steps|decision|reset/.test(ask) ? 'Flowchart' : 'Cloud architecture';
    code = EXAMPLES[pick] ?? Object.values(EXAMPLES)[0]!;
    note = `Demo mode: this is the "${pick}" example. Add an Anthropic API key below to use Claude.`;
  }
  await sleep(500, signal);
  const reply = '```octodraw\n' + code.trim() + '\n```\n' + note;
  for (let i = 0; i < reply.length; i += 6) {
    yield reply.slice(i, i + 6);
    await sleep(8, signal);
  }
};
