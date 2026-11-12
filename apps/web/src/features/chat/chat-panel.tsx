"use client";

import "@octonote/widgets/styles.css";
import "@octonote/interactive/styles.css";
import "@octonote/motion/styles.css";
import "@octonote/compose/styles.css";
import {
  checkBlock,
  defaultCatalog,
  markdownToBlocks,
} from "@octonote/compose";
import { BlockView } from "@octonote/compose/react";
import { defaultComponents, InteractiveProvider } from "@octonote/interactive";
import { WidgetsProvider } from "@octonote/widgets";
import {
  ArrowUp,
  AtSign,
  Check,
  FileText,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  Network,
  PanelsTopLeft,
  Plus,
  Square,
  Trash2,
  X,
  Folder,
  Shapes,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  decideProposal,
  deleteThread,
  findMentions,
  getThread,
  insertShown,
  listThreads,
  sendMessage,
  type ChatEvent,
  type ChatMessage,
  type Here,
  type Mention,
  type Proposal,
  type ShownBlock,
  type ThreadSummary,
} from "./api";
import { useChat } from "./chat-context";

const PATHS: Record<string, string> = {
  pag: "/n/",
  cnv: "/c/",
  prj: "/p/",
  ntb: "/nb/",
};
const hrefFor = (id?: string) =>
  id && PATHS[id.slice(0, 3)] ? `${PATHS[id.slice(0, 3)]}${id}` : undefined;

/** What the person is looking at, from the URL: "this note" in a question means it. */
function useHere(): Here | undefined {
  const pathname = usePathname() ?? "";
  return useMemo(() => {
    const m = /^\/(n|c|p|nb)\/((?:pag|cnv|prj|ntb)_[\w-]+)/.exec(pathname);
    if (!m) return undefined;
    const kind = (
      { n: "note", c: "canvas", p: "project", nb: "notebook" } as const
    )[m[1] as "n" | "c" | "p" | "nb"];
    return { kind, id: m[2]! };
  }, [pathname]);
}

const MENTION_ICONS = {
  note: FileText,
  canvas: Shapes,
  project: PanelsTopLeft,
  notebook: Folder,
  figure: ImageIcon,
  block: LayoutDashboard,
} as const;

export function ChatPanelBody() {
  const { open, setOpen, workspaceId } = useChat();
  const here = useHere();
  const [threadId, setThreadId] = useState<string | undefined>();
  const [title, setTitle] = useState("New chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dark = useIsDark();

  // Keep the newest message in view while it streams.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const loadThreads = useCallback(() => {
    listThreads(workspaceId)
      .then(setThreads)
      .catch(() => setThreads([]));
  }, [workspaceId]);

  const newChat = () => {
    abort.current?.abort();
    setThreadId(undefined);
    setTitle("New chat");
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

  const openThread = async (id: string) => {
    abort.current?.abort();
    setShowHistory(false);
    setError(null);
    try {
      const t = await getThread(id);
      setThreadId(t.id);
      setTitle(t.title);
      setMessages(t.messages);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = async (text: string, mentions: Mention[]) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: {
        text,
        ...(mentions.length ? { mentions } : {}),
        ...(here ? { here } : {}),
      },
    };
    const replyId = `reply-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMessage,
      {
        id: replyId,
        role: "assistant",
        content: { text: "", steps: [], blocks: [], proposals: [] },
      },
    ]);
    const patch = (
      fn: (c: ChatMessage["content"]) => ChatMessage["content"],
      id = replyId,
    ) =>
      setMessages((all) =>
        all.map((m) => (m.id === id ? { ...m, content: fn(m.content) } : m)),
      );
    let currentId = replyId;
    const onEvent = (event: ChatEvent) => {
      switch (event.type) {
        case "thread":
          setThreadId(event.threadId);
          setTitle(event.title);
          break;
        case "text":
          patch((c) => ({ ...c, text: c.text + event.delta }), currentId);
          break;
        case "step":
          patch(
            (c) => ({ ...c, steps: [...(c.steps ?? []), event.label] }),
            currentId,
          );
          break;
        case "block":
          patch(
            (c) => ({ ...c, blocks: [...(c.blocks ?? []), event.block] }),
            currentId,
          );
          break;
        case "proposal":
          patch(
            (c) => ({
              ...c,
              proposals: [...(c.proposals ?? []), event.proposal],
            }),
            currentId,
          );
          break;
        case "error":
          patch((c) => ({ ...c, error: event.message }), currentId);
          break;
        case "done": {
          // The saved id lets proposals be applied.
          const saved = event.messageId;
          setMessages((all) =>
            all.map((m) => (m.id === currentId ? { ...m, id: saved } : m)),
          );
          currentId = saved;
          break;
        }
      }
    };
    try {
      await sendMessage(
        {
          workspaceId,
          ...(threadId ? { threadId } : {}),
          text,
          ...(mentions.length ? { mentions } : {}),
          ...(here ? { here } : {}),
        },
        onEvent,
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError((e as Error).message);
        setMessages((all) =>
          all.filter((m) => m.id !== replyId || m.content.text),
        );
      }
    } finally {
      setBusy(false);
      if (threads) loadThreads();
    }
  };

  const decide = async (
    messageId: string,
    proposal: Proposal,
    decision: "apply" | "dismiss",
  ) => {
    try {
      const updated = await decideProposal(messageId, proposal.id, decision);
      setMessages((all) =>
        all.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: {
                  ...m.content,
                  proposals: m.content.proposals?.map((p) =>
                    p.id === updated.id ? updated : p,
                  ),
                },
              }
            : m,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!open) return null;
  const theme = dark ? "dark" : "light";

  return (
    <aside
      className="bg-background fixed inset-0 z-50 flex flex-col md:sticky md:top-0 md:z-auto md:h-svh md:w-[420px] md:shrink-0 md:border-l"
      aria-label="AI chat"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <p className="text-foreground-strong min-w-0 flex-1 truncate text-sm font-semibold">
          {title}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Past chats"
          aria-pressed={showHistory}
          onClick={() => {
            setShowHistory((s) => !s);
            if (!threads) loadThreads();
          }}
        >
          <History className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="New chat"
          onClick={newChat}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Close chat (⌘J)"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </header>

      {showHistory ? (
        <div className="max-h-72 shrink-0 overflow-y-auto border-b">
          {threads === null ? (
            <p className="text-muted-foreground p-3 text-sm">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No chats yet.</p>
          ) : (
            <ul>
              {threads.map((t) => (
                <li key={t.id} className="group flex items-center">
                  <button
                    type="button"
                    className={cn(
                      "hover:bg-muted min-w-0 flex-1 truncate px-3 py-2 text-left text-sm",
                      t.id === threadId && "font-semibold",
                    )}
                    onClick={() => void openThread(t.id)}
                  >
                    {t.title}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1 size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete "${t.title}"`}
                    onClick={async () => {
                      await deleteThread(t.id).catch(() => {});
                      if (t.id === threadId) newChat();
                      loadThreads();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? <Welcome here={here} /> : null}
        <InteractiveProvider components={defaultComponents} theme={theme}>
          <WidgetsProvider theme={theme}>
            <div className="flex flex-col gap-4">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserBubble key={m.id} message={m} />
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    streaming={busy && i === messages.length - 1}
                    here={here}
                    onDecide={(p, d) => void decide(m.id, p, d)}
                  />
                ),
              )}
            </div>
          </WidgetsProvider>
        </InteractiveProvider>
        {error ? (
          <p role="alert" className="text-destructive mt-3 text-sm">
            {error}
          </p>
        ) : null}
      </div>

      <Composer
        workspaceId={workspaceId}
        here={here}
        busy={busy}
        onSend={(t, m) => void send(t, m)}
        onStop={() => abort.current?.abort()}
      />
    </aside>
  );
}

function Welcome({ here }: { here?: Here }) {
  return (
    <div className="text-muted-foreground mt-6 space-y-3 px-1 text-sm">
      <p className="text-foreground-strong text-base font-semibold">
        Ask about anything in your workspace.
      </p>
      <p>
        Type <kbd className="bg-muted rounded px-1">@</kbd> to bring in a note,
        canvas, figure, project, notebook or a widget
        {here?.kind === "note" ? " from this note" : ""}.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Explain this {here?.kind ?? "note"} in three bullet points</li>
        <li>Quiz me on @a note</li>
        <li>Turn @a note into a canvas</li>
        <li>Make @a widget show monthly contributions</li>
      </ul>
      <p className="text-xs">
        Changes are proposed as cards; nothing changes until you apply it.
      </p>
    </div>
  );
}

function MentionChip({
  mention,
  onRemove,
}: {
  mention: Mention;
  onRemove?: () => void;
}) {
  const Icon = MENTION_ICONS[mention.kind];
  const href =
    mention.kind === "block" ? hrefFor(mention.noteId) : hrefFor(mention.id);
  const body = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{mention.title}</span>
    </>
  );
  return (
    <span className="bg-muted text-foreground inline-flex max-w-[16rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs">
      {href && !onRemove ? (
        <Link
          href={href}
          className="inline-flex min-w-0 items-center gap-1 hover:underline"
        >
          {body}
        </Link>
      ) : (
        body
      )}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${mention.title}`}
          className="hover:text-foreground-strong"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="bg-muted ml-8 self-end rounded-2xl rounded-br-md px-3 py-2 text-sm">
      {message.content.mentions?.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {message.content.mentions.map((m) => (
            <MentionChip key={`${m.kind}-${m.id}`} mention={m} />
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap">{message.content.text}</p>
    </div>
  );
}

function AssistantMessage({
  message,
  streaming,
  here,
  onDecide,
}: {
  message: ChatMessage;
  streaming: boolean;
  here?: Here;
  onDecide: (p: Proposal, d: "apply" | "dismiss") => void;
}) {
  const c = message.content;
  const prose = useMemo(
    () =>
      c.text
        ? {
            kind: "text",
            id: `${message.id}-text`,
            renderer: "content" as const,
            blocks: markdownToBlocks(c.text),
          }
        : null,
    [c.text, message.id],
  );
  const saved = !message.id.startsWith("reply-");
  return (
    <div className="text-sm">
      {c.steps?.length ? (
        <ul className="text-muted-foreground mb-2 space-y-0.5 text-xs">
          {c.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Check className="size-3" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      ) : null}
      {prose ? (
        <div className="cx-chat-prose">
          <BlockView block={prose as never} />
        </div>
      ) : streaming ? (
        <p className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Thinking…
        </p>
      ) : null}
      {c.blocks?.map((b) => (
        <Shown key={b.id} block={b} here={here} />
      ))}
      {c.proposals?.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          canDecide={saved && !streaming}
          onDecide={(d) => onDecide(p, d)}
        />
      ))}
      {c.error ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {c.error}
        </p>
      ) : null}
    </div>
  );
}

/** A widget, quiz or animation the assistant showed, live, with a way to keep it in the note. */
function Shown({ block, here }: { block: ShownBlock; here?: Here }) {
  const result = useMemo(
    () =>
      checkBlock(
        defaultCatalog,
        { ...block.spec, kind: block.kind },
        `chat-${block.id}`,
      ),
    [block],
  );
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(
    "idle",
  );
  if (!result.ok) return null;
  return (
    <div className="bg-card mt-3 overflow-hidden rounded-xl border">
      <div className="p-3">
        <BlockView block={result.block} />
      </div>
      {here?.kind === "note" ? (
        <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={state === "busy" || state === "done"}
            onClick={async () => {
              setState("busy");
              try {
                await insertShown(here.id, block.kind, block.spec);
                setState("done");
              } catch {
                setState("failed");
              }
            }}
          >
            {state === "busy" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : state === "done" ? (
              <Check className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {state === "done"
              ? "Added to this note"
              : state === "failed"
                ? "Couldn't add it"
                : "Add to this note"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProposalCard({
  proposal,
  canDecide,
  onDecide,
}: {
  proposal: Proposal;
  canDecide: boolean;
  onDecide: (d: "apply" | "dismiss") => void;
}) {
  const [busy, setBusy] = useState(false);
  const href = hrefFor(
    proposal.result?.id ??
      (typeof proposal.args.id === "string"
        ? proposal.args.id
        : typeof proposal.args.note === "string"
          ? proposal.args.note
          : undefined),
  );
  const preview =
    typeof proposal.args.markdown === "string"
      ? proposal.args.markdown
      : typeof proposal.args.mermaid === "string"
        ? proposal.args.mermaid
        : proposal.args.spec
          ? JSON.stringify(proposal.args.spec, null, 2)
          : "";
  return (
    <div className="mt-3 rounded-xl border">
      <div className="flex items-start gap-2 p-3">
        <Network
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-foreground-strong font-medium">
            {proposal.summary}
          </p>
          <p className="text-muted-foreground text-xs">
            {proposal.status === "proposed"
              ? "Proposed change: nothing happens until you apply it."
              : proposal.status === "applied"
                ? "Applied."
                : proposal.status === "dismissed"
                  ? "Dismissed."
                  : `Couldn't apply: ${proposal.result?.error ?? "unknown error"}`}
          </p>
          {preview ? (
            <details className="mt-2">
              <summary className="text-muted-foreground cursor-pointer text-xs">
                Show the change
              </summary>
              <pre className="bg-muted mt-1 max-h-56 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                {preview.slice(0, 6000)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-3 py-1.5">
        {proposal.status === "applied" && href ? (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href={href}>Open</Link>
          </Button>
        ) : null}
        {proposal.status === "proposed" ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!canDecide || busy}
              onClick={() => {
                setBusy(true);
                onDecide("dismiss");
              }}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!canDecide || busy}
              onClick={() => {
                setBusy(true);
                onDecide("apply");
              }}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Apply
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The message box: Enter sends, Shift+Enter is a new line, @ brings in things to talk about. */
function Composer({
  workspaceId,
  here,
  busy,
  onSend,
  onStop,
}: {
  workspaceId: string;
  here?: Here;
  busy: boolean;
  onSend: (text: string, mentions: Mention[]) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<Mention[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);

  // Look things up as the person types after "@".
  useEffect(() => {
    if (query === null) return;
    let live = true;
    const t = setTimeout(() => {
      findMentions(
        workspaceId,
        query,
        here?.kind === "note" ? here.id : undefined,
      )
        .then((found) => {
          if (!live) return;
          setOptions(
            found.filter(
              (f) => !mentions.some((m) => m.kind === f.kind && m.id === f.id),
            ),
          );
          setActive(0);
        })
        .catch(() => live && setOptions([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, workspaceId, here, mentions]);

  const onChange = (value: string) => {
    setText(value);
    const caret = box.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([^\s@]{0,40})$/.exec(before);
    setQuery(m ? m[1]! : null);
  };

  const pick = (mention: Mention) => {
    const caret = box.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,40})$/, "");
    setText(before + text.slice(caret));
    setMentions((all) => [...all, mention].slice(0, 8));
    setQuery(null);
    box.current?.focus();
  };

  const submit = () => {
    const clean = text.trim();
    if (!clean || busy) return;
    onSend(clean, mentions);
    setText("");
    setMentions([]);
    setQuery(null);
  };

  return (
    <div className="relative shrink-0 border-t p-3">
      {query !== null && options.length ? (
        <ul
          role="listbox"
          aria-label="Mention"
          className="bg-popover absolute right-3 bottom-full left-3 mb-1 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {options.map((o, i) => {
            const Icon = MENTION_ICONS[o.kind];
            return (
              <li
                key={`${o.kind}-${o.noteId ?? ""}-${o.id}`}
                role="option"
                aria-selected={i === active}
              >
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    i === active ? "bg-muted" : "hover:bg-muted",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                >
                  <Icon
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {o.kind === "block" ? "in this note" : o.kind}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {mentions.length || here ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {here ? (
            <span
              className="text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
              title="The assistant knows what you're looking at"
            >
              This {here.kind}
            </span>
          ) : null}
          {mentions.map((m, i) => (
            <MentionChip
              key={`${m.kind}-${m.id}`}
              mention={m}
              onRemove={() =>
                setMentions((all) => all.filter((_, j) => j !== i))
              }
            />
          ))}
        </div>
      ) : null}
      <div className="bg-background focus-within:ring-ring flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2">
        <textarea
          ref={box}
          value={text}
          rows={2}
          placeholder="Ask, or type @ to mention something"
          aria-label="Message"
          className="max-h-48 min-h-[2.5rem] flex-1 resize-none bg-transparent text-sm outline-none"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (query !== null && options.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive(
                  (a) =>
                    (a + (e.key === "ArrowDown" ? 1 : options.length - 1)) %
                    options.length,
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(options[active]!);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery(null);
                return;
              }
            }
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Mention something"
          onClick={() => {
            setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@`);
            setQuery("");
            box.current?.focus();
          }}
        >
          <AtSign className="size-4" />
        </Button>
        {busy ? (
          <Button
            size="icon"
            variant="secondary"
            className="size-8 shrink-0 rounded-full"
            aria-label="Stop"
            onClick={onStop}
          >
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-8 shrink-0 rounded-full"
            aria-label="Send"
            disabled={!text.trim()}
            onClick={submit}
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setDark(root.classList.contains("dark")),
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
