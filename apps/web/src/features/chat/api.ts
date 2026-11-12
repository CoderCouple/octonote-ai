import { env } from "@/env/client";
import { bearerToken, clientApi } from "@/lib/api/client-fetch";

export type MentionKind =
  "note" | "canvas" | "project" | "notebook" | "figure" | "block";

export interface Mention {
  kind: MentionKind;
  id: string;
  title: string;
  noteId?: string;
}

export interface Here {
  kind: "note" | "canvas" | "project" | "notebook";
  id: string;
  title?: string;
}

export interface Proposal {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: "proposed" | "applied" | "dismissed" | "failed";
  result?: { id?: string; url?: string; title?: string; error?: string };
}

export interface ShownBlock {
  id: string;
  kind: string;
  spec: Record<string, unknown>;
}

export interface MessageContent {
  text: string;
  mentions?: Mention[];
  here?: Here;
  blocks?: ShownBlock[];
  proposals?: Proposal[];
  steps?: string[];
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: MessageContent;
}

export interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type ChatEvent =
  | { type: "thread"; threadId: string; title: string }
  | { type: "text"; delta: string }
  | { type: "step"; label: string }
  | { type: "block"; block: ShownBlock }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export const listThreads = (workspaceId: string) =>
  clientApi.get<ThreadSummary[]>(
    `/ai/chat/threads?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
export const getThread = (id: string) =>
  clientApi.get<{ id: string; title: string; messages: ChatMessage[] }>(
    `/ai/chat/threads/${id}`,
  );
export const deleteThread = (id: string) =>
  clientApi.delete<void>(`/ai/chat/threads/${id}`);
export const decideProposal = (
  messageId: string,
  proposalId: string,
  decision: "apply" | "dismiss",
) =>
  clientApi.post<Proposal>(
    `/ai/chat/messages/${messageId}/proposals/${proposalId}`,
    { decision },
  );
export const findMentions = (workspaceId: string, q: string, note?: string) =>
  clientApi.get<Mention[]>(
    `/ai/chat/mentions?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(q)}${note ? `&note=${encodeURIComponent(note)}` : ""}`,
  );
export const insertShown = (
  noteId: string,
  kind: string,
  spec: Record<string, unknown>,
) =>
  clientApi.post<{ id: string; title: string; url: string }>(
    "/ai/chat/insert",
    { noteId, kind, spec },
  );

/**
 * Sends a message and calls `onEvent` for each event of the streamed reply.
 * Errors before the reply starts (rate limit, no AI on the server) throw with
 * the server's message.
 */
export async function sendMessage(
  body: {
    workspaceId: string;
    threadId?: string;
    text: string;
    mentions?: Mention[];
    here?: Here;
  },
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await bearerToken();
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/ai/chat`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-octonote-client": "web",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new Error(
      data?.error?.message ??
        data?.message ??
        `The chat couldn't start (${response.status}).`,
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // Events are "data: {…}" lines separated by a blank line.
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try {
          onEvent(JSON.parse(line.slice(6)) as ChatEvent);
        } catch {
          // A malformed event is skipped rather than ending the reply.
        }
      }
      end = buffer.indexOf("\n\n");
    }
  }
}
