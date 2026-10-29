import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagramType } from '../dsl/detect';
import type { Diagnostic } from '../dsl/types';
import type { DiagramAttachment } from './attachments';
import { generateDiagram, type DiagramModel, type DiagramReference, type GenerateResult, type ModelMessage } from './generate';

export type ChatStatus = 'writing' | 'repairing' | 'done' | 'error' | 'cancelled';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** User prompt, or the assistant's prose reply / error message. */
  text: string;
  /** Figures attached to a user message. */
  references?: { id: string; label: string }[];
  /** Files attached to a user message (names only; contents aren't kept in the conversation). */
  attachments?: { name: string; kind: DiagramAttachment['kind'] }[];
  status?: ChatStatus;
  /** Diagram code written so far (assistant). */
  code?: string;
  diagnostics?: Diagnostic[];
  /** The figure this answer edited; undefined when it created a new one. */
  target?: string;
}

export interface SendOptions {
  references?: DiagramReference[];
  attachments?: DiagramAttachment[];
  type?: DiagramType;
}

export interface UseDiagramChatOptions {
  model: DiagramModel;
  instructions?: string;
  maxRepairs?: number;
  /** A diagram is ready: update `target` (a reference id) or create a new figure when it's undefined. */
  onResult: (result: GenerateResult, target: DiagramReference | undefined) => void;
  /** Code as it streams in, for hosts that preview it (e.g. in a code editor). */
  onDraft?: (code: string, target: DiagramReference | undefined) => void;
  /** A saved conversation to continue (from onMessagesChange). */
  initialMessages?: ChatMessage[];
  /** Called when a turn finishes, with messages worth saving. */
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

let nextId = 0;
const newId = () => `m${Date.now().toString(36)}-${++nextId}`;

/** Model history rebuilt from a saved conversation: each prompt and the diagram it produced. */
export function historyFromMessages(messages: ChatMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  messages.forEach((m, i) => {
    const answer = messages[i + 1];
    if (m.role !== 'user' || answer?.role !== 'assistant' || answer.status !== 'done' || !answer.code) return;
    out.push({ role: 'user', content: m.text }, { role: 'assistant', content: '```octodraw\n' + answer.code + '\n```' });
  });
  return out;
}

/** Conversation state for diagram generation; UI-agnostic (DiagramChat is one UI for it). */
export function useDiagramChat({ model, instructions, maxRepairs, onResult, onDraft, initialMessages, onMessagesChange }: UseDiagramChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages ?? []);
  const [busy, setBusy] = useState(false);
  const history = useRef<ModelMessage[]>(historyFromMessages(initialMessages ?? []));
  const abort = useRef<AbortController | null>(null);
  // Latest callbacks without re-creating `send`.
  const callbacks = useRef({ model, instructions, maxRepairs, onResult, onDraft });
  callbacks.current = { model, instructions, maxRepairs, onResult, onDraft };
  const saveMessages = useRef(onMessagesChange);
  saveMessages.current = onMessagesChange;
  // Report settled conversations only (not every streamed chunk).
  useEffect(() => {
    if (!busy) saveMessages.current?.(messages);
  }, [busy, messages]);

  const patch = (id: string, change: Partial<ChatMessage>) => setMessages((all) => all.map((m) => (m.id === id ? { ...m, ...change } : m)));

  const send = useCallback(async (prompt: string, { references = [], attachments = [], type }: SendOptions = {}) => {
    const text = prompt.trim();
    if ((!text && !attachments.length) || abort.current) return;
    const target = references[0];
    const answerId = newId();
    setMessages((all) => [
      ...all,
      {
        id: newId(),
        role: 'user',
        text: text || 'Draw a diagram of the attached files.',
        references: references.map(({ id, label }) => ({ id, label })),
        ...(attachments.length ? { attachments: attachments.map(({ name, kind }) => ({ name, kind })) } : {}),
      },
      { id: answerId, role: 'assistant', text: '', status: 'writing', code: '', target: target?.id },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    const { model, instructions, maxRepairs } = callbacks.current;
    try {
      const result = await generateDiagram({
        model,
        prompt: text,
        references,
        attachments,
        type,
        instructions,
        maxRepairs,
        history: history.current,
        signal: controller.signal,
        onText: (_, code) => {
          patch(answerId, { code });
          callbacks.current.onDraft?.(code, target);
        },
        onRepair: (diagnostics) => patch(answerId, { status: 'repairing', diagnostics }),
      });
      history.current = result.messages;
      patch(answerId, { status: 'done', code: result.source, text: result.reply, diagnostics: result.diagnostics });
      callbacks.current.onResult(result, target);
    } catch (error) {
      const cancelled = controller.signal.aborted;
      patch(answerId, { status: cancelled ? 'cancelled' : 'error', text: cancelled ? 'Stopped.' : error instanceof Error ? error.message : String(error) });
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }, []);

  const cancel = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    history.current = [];
    setMessages([]);
  }, []);

  return { messages, busy, send, cancel, reset };
}
