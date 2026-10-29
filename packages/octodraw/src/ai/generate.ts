import { detectDiagramType, type DiagramType } from '../dsl/detect';
import { parseErd } from '../dsl/erd';
import { parseDiagram } from '../dsl/parse';
import { parseSequence } from '../dsl/sequence';
import type { Diagnostic } from '../dsl/types';
import { attachmentsText, suggestDiagramType, type ContentPart, type DiagramAttachment } from './attachments';
import { diagramSystemPrompt } from './prompt';

// Model-agnostic diagram generation. octodraw never calls a model itself: the
// host passes a `DiagramModel` (its own backend, Claude, anything) and
// octodraw builds the prompt, extracts and validates the code, and asks the
// model to repair it when the parsers report errors.

export interface ModelMessage {
  role: 'user' | 'assistant';
  /** Text, or text and image parts when the user attached images (map them to your model's format). */
  content: string | ContentPart[];
}

export interface DiagramModelRequest {
  system: string;
  messages: ModelMessage[];
  signal: AbortSignal;
}

/** The host's model call: stream text chunks (preferred) or resolve the whole reply. */
export type DiagramModel = (request: DiagramModelRequest) => AsyncIterable<string> | Promise<string>;

/** A figure the request refers to; the first one is the figure being edited. */
export interface DiagramReference {
  id: string;
  label: string;
  source: string;
  type?: DiagramType;
}

export interface GenerateOptions {
  model: DiagramModel;
  prompt: string;
  references?: DiagramReference[];
  /** Files to draw from: code, infrastructure, schemas, images. */
  attachments?: DiagramAttachment[];
  /** Earlier turns of the conversation, oldest first. */
  history?: ModelMessage[];
  /** Force a diagram type (e.g. from a "Sequence diagram" starter). */
  type?: DiagramType;
  /** Extra system instructions from the host. */
  instructions?: string;
  signal?: AbortSignal;
  /** Repair rounds when the result has errors. Defaults to 1. */
  maxRepairs?: number;
  /** Called as text arrives with the reply so far and the code extracted from it. */
  onText?: (text: string, code: string) => void;
  /** Called when a repair round starts. */
  onRepair?: (diagnostics: Diagnostic[]) => void;
}

export interface GenerateResult {
  source: string;
  type: DiagramType;
  /** Problems left after the repair rounds (warnings, or errors the model couldn't fix). */
  diagnostics: Diagnostic[];
  /** The model's prose outside the code block, if any. */
  reply: string;
  /** Repair rounds used. */
  repairs: number;
  /** The conversation including this request, for follow-up turns. */
  messages: ModelMessage[];
}

const FENCE = /```[\w-]*[^\S\n]*\n?/;

/**
 * Splits a model reply into diagram code and prose. Works on partial text
 * while streaming: an unterminated fence yields what has arrived so far.
 */
export function extractDiagramCode(text: string): { code: string; reply: string } {
  const open = FENCE.exec(text);
  if (!open) {
    // No fence: treat the whole reply as code unless it's clearly prose.
    const looksLikeCode = /[[{>]|^\s*(title|direction|notation)\b/m.test(text);
    return looksLikeCode ? { code: text.trim(), reply: '' } : { code: '', reply: text.trim() };
  }
  const start = open.index + open[0].length;
  const close = text.indexOf('```', start);
  const code = (close < 0 ? text.slice(start) : text.slice(start, close)).replace(/\s+$/, '');
  const reply = [text.slice(0, open.index), close < 0 ? '' : text.slice(close + 3)].map((t) => t.trim()).filter(Boolean).join('\n');
  return { code, reply };
}

export interface ValidationResult {
  type: DiagramType;
  diagnostics: Diagnostic[];
  errors: Diagnostic[];
}

/** Parse diagram code with the parser for its type; no DOM needed. */
export function validateDiagram(source: string, type: DiagramType = detectDiagramType(source)): ValidationResult {
  let diagnostics: Diagnostic[];
  let empty: boolean;
  if (type === 'erd') {
    const erd = parseErd(source);
    diagnostics = erd.diagnostics;
    empty = erd.entities.size === 0;
  } else if (type === 'sequence') {
    const seq = parseSequence(source);
    diagnostics = seq.diagnostics;
    empty = seq.participants.size === 0;
  } else {
    const diagram = parseDiagram(source);
    diagnostics = diagram.diagnostics;
    empty = diagram.nodes.size === 0;
  }
  if (empty) diagnostics = [...diagnostics, { severity: 'error', message: 'The diagram is empty', line: 1, column: 1, endColumn: 2 }];
  return { type, diagnostics, errors: diagnostics.filter((d) => d.severity === 'error') };
}

/** The user message for a request, with referenced figures and text attachments inlined. */
export function buildUserMessage(prompt: string, references: DiagramReference[] = [], type?: DiagramType, attachments: DiagramAttachment[] = []): string {
  const parts = references.map((ref, i) =>
    [`${i === 0 ? 'Figure to edit' : 'Reference figure'}: "${ref.label}"`, '```octodraw', ref.source.trim(), '```'].join('\n'),
  );
  if (attachments.length) parts.push(attachmentsText(attachments));
  const kind = type ? ` (${{ flow: 'architecture diagram or flowchart', erd: 'entity relationship diagram', sequence: 'sequence diagram', bpmn: 'BPMN swimlane diagram' }[type]})` : '';
  const ask = prompt.trim() || (attachments.length ? 'Draw a diagram of the attached files.' : '');
  parts.push(references.length ? `Request${kind}: ${ask}` : `Create a diagram${kind}: ${ask}`);
  return parts.join('\n\n');
}

/** The message content: plain text, or image parts followed by the text when images are attached. */
export function buildUserContent(prompt: string, references: DiagramReference[] = [], type?: DiagramType, attachments: DiagramAttachment[] = []): string | ContentPart[] {
  const text = buildUserMessage(prompt, references, type, attachments);
  const images = attachments.filter((a) => a.kind === 'image' && a.data && a.mediaType);
  if (!images.length) return text;
  return [...images.map((a): ContentPart => ({ type: 'image', mediaType: a.mediaType!, data: a.data! })), { type: 'text', text }];
}

async function collect(model: DiagramModel, request: DiagramModelRequest, onChunk: (text: string) => void): Promise<string> {
  const result = model(request);
  if (typeof (result as AsyncIterable<string>)[Symbol.asyncIterator] !== 'function') {
    const text = await (result as Promise<string>);
    onChunk(text);
    return text;
  }
  let text = '';
  for await (const chunk of result as AsyncIterable<string>) {
    if (request.signal.aborted) break;
    text += chunk;
    onChunk(text);
  }
  return text;
}

const describe = (d: Diagnostic) => `line ${d.line}: ${d.message}`;

/** Ask the model for a diagram, validate it, and repair it if it has errors. */
export async function generateDiagram(options: GenerateOptions): Promise<GenerateResult> {
  const { model, prompt, references = [], attachments = [], history = [], maxRepairs = 1, onText, onRepair } = options;
  const signal = options.signal ?? new AbortController().signal;
  const type = options.type ?? references[0]?.type ?? suggestDiagramType(attachments);
  const system = diagramSystemPrompt({ type, instructions: options.instructions });
  const messages: ModelMessage[] = [...history, { role: 'user', content: buildUserContent(prompt, references, type, attachments) }];

  let repairs = 0;
  for (;;) {
    const text = await collect(model, { system, messages, signal }, (t) => onText?.(t, extractDiagramCode(t).code));
    signal.throwIfAborted();
    messages.push({ role: 'assistant', content: text });
    const { code, reply } = extractDiagramCode(text);
    if (!code) throw new Error(reply || 'The model did not return a diagram');
    const result = validateDiagram(code, options.type);
    if (result.errors.length === 0 || repairs >= maxRepairs) {
      return { source: code, type: result.type, diagnostics: result.diagnostics, reply, repairs, messages };
    }
    repairs++;
    onRepair?.(result.errors);
    messages.push({
      role: 'user',
      content: `The diagram has syntax errors:\n${result.errors.slice(0, 20).map(describe).join('\n')}\nReturn the complete corrected diagram.`,
    });
  }
}
