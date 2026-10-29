import { useEffect, useRef, useState } from 'react';
import { commentPosition, mentionsIn, type CanvasDocument, type CommentAuthor, type CommentThread } from './model';

// Comment pins and the open thread, drawn in screen space (constant size at
// any zoom) above the canvas.

interface Camera {
  x: number;
  y: number;
  k: number;
}

/** A thread being started: where it will be pinned, before its first message exists. */
export type DraftThread = Pick<CommentThread, 'item' | 'x' | 'y'>;

export interface CommentLayerProps {
  doc: CanvasDocument;
  cam: Camera;
  open: string | null;
  draft: DraftThread | null;
  showResolved: boolean;
  onOpen: (id: string | null) => void;
  onCancelDraft: () => void;
  /** Post a message: to an existing thread (id) or the draft (null), with the people it mentions. */
  onPost: (threadId: string | null, text: string, mentions: CommentAuthor[]) => void;
  /** People who can be @mentioned. */
  people?: CommentAuthor[];
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function ago(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

export function CommentLayer({ doc, cam, open, draft, showResolved, onOpen, onCancelDraft, onPost, onResolve, onDelete, people = [] }: CommentLayerProps) {
  const toScreen = (p: { x: number; y: number }) => ({ left: cam.x + p.x * cam.k, top: cam.y + p.y * cam.k });
  const threads = (doc.comments ?? []).filter((t) => showResolved || !t.resolved || t.id === open);
  const openThread = open ? doc.comments?.find((t) => t.id === open) : undefined;
  const popoverAt = draft ? toScreen(draft.item ? commentPosition(doc, { ...draft, id: '', messages: [] }) : draft) : openThread ? toScreen(commentPosition(doc, openThread)) : null;

  return (
    <div className="occ-comments">
      {threads.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`occ-pin occ-chrome${t.resolved ? ' occ-pin-resolved' : ''}`}
          aria-pressed={open === t.id}
          aria-label={`Comment by ${t.messages[0]?.author.name ?? 'someone'}`}
          style={toScreen(commentPosition(doc, t))}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(open === t.id ? null : t.id)}
        >
          {initials(t.messages[0]?.author.name ?? '?')}
          {t.messages.length > 1 && <span className="occ-pin-count">{t.messages.length}</span>}
        </button>
      ))}
      {draft && <span className="occ-pin occ-pin-draft" style={popoverAt!} />}
      {popoverAt && (draft || openThread) && (
        <ThreadPopover
          key={draft ? 'draft' : openThread!.id}
          thread={draft ? undefined : openThread}
          style={{ left: popoverAt.left + 20, top: popoverAt.top - 8 }}
          onClose={() => (draft ? onCancelDraft() : onOpen(null))}
          onPost={(text, mentions) => onPost(draft ? null : openThread!.id, text, mentions)}
          people={people}
          onResolve={openThread ? () => onResolve(openThread.id, !openThread.resolved) : undefined}
          onDelete={openThread ? () => onDelete(openThread.id) : undefined}
        />
      )}
    </div>
  );
}

/** Message text with @mentions of known people highlighted. */
function MessageText({ text, people }: { text: string; people: CommentAuthor[] }) {
  const names = [...new Set(people.map((p) => p.name))].sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="occ-mention">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ThreadPopover({ thread, style, onClose, onPost, onResolve, onDelete, people = [] }: { thread?: CommentThread; style: React.CSSProperties; onClose: () => void; onPost: (text: string, mentions: CommentAuthor[]) => void; onResolve?: () => void; onDelete?: () => void; people?: CommentAuthor[] }) {
  const [text, setText] = useState('');
  // "@query" right before the caret opens the people picker.
  const [caret, setCaret] = useState(0);
  const mention = people.length ? /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret)) : null;
  const matches = mention ? people.filter((p) => p.name.toLowerCase().includes(mention[2]!.toLowerCase())).slice(0, 6) : [];
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [mention?.[2]]);
  const pick = (person: CommentAuthor) => {
    const start = caret - mention![2]!.length - 1;
    const next = `${text.slice(0, start)}@${person.name} ${text.slice(caret)}`;
    setText(next);
    const at = start + person.name.length + 2;
    setCaret(at);
    requestAnimationFrame(() => input.current?.setSelectionRange(at, at));
  };
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    // Again next frame, in case the click that opened the thread moved focus after this effect.
    const frame = requestAnimationFrame(() => {
      if (input.current && document.activeElement !== input.current) input.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const post = () => {
    if (!text.trim()) return;
    onPost(text.trim(), mentionsIn(text, people));
    setText('');
  };
  return (
    <div className="occ-thread occ-chrome" style={style} role="dialog" aria-label="Comment thread" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {thread && (
        <div className="occ-thread-head">
          <span>{thread.resolved ? 'Resolved' : 'Comment'}</span>
          <span className="occ-thread-actions">
            <button type="button" onClick={onResolve} title={thread.resolved ? 'Reopen' : 'Resolve'}>
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button type="button" onClick={onDelete} title="Delete thread" aria-label="Delete thread">
              Delete
            </button>
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </span>
        </div>
      )}
      {thread && (
        <div className="occ-thread-messages">
          {thread.messages.map((m) => (
            <div key={m.id} className="occ-message">
              <div className="occ-message-meta">
                <span className="occ-avatar">{initials(m.author.name)}</span>
                <strong>{m.author.name}</strong>
                <span>{ago(m.at)}</span>
              </div>
              <p>
                <MessageText text={m.text} people={[...people, ...thread.messages.map((x) => x.author)]} />
              </p>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={input}
        rows={2}
        value={text}
        placeholder={thread ? 'Reply…' : people.length ? 'Add a comment… (@ to mention)' : 'Add a comment…'}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
          } else if (matches.length && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault();
            pick(matches[active]!);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            post();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {matches.length > 0 && (
        <div className="occ-mention-picker" role="listbox" aria-label="Mention someone">
          {matches.map((p, i) => (
            <button key={p.id} type="button" role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span className="occ-avatar">{initials(p.name)}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="occ-thread-foot">
        {!thread && (
          <button type="button" className="occ-button" onClick={onClose}>
            Cancel
          </button>
        )}
        <button type="button" className="occ-button occ-button-primary" onClick={post} disabled={!text.trim()}>
          {thread ? 'Reply' : 'Comment'}
        </button>
      </div>
    </div>
  );
}
