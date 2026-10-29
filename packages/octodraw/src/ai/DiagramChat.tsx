import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { DiagramType } from '../dsl/detect';
import { useResolvedScheme } from '../react/OctoDiagram';
import { themeCssVariables, themes as builtInThemes, type ColorScheme, type Theme } from '../theme/tokens';
import { attachmentFromFile, attachmentsFromFolder, attachmentsFromGitHub, classifyAttachment, filesFromZip, isZip, type DiagramAttachment } from './attachments';
import type { DiagramModel, DiagramReference, GenerateResult } from './generate';
import { useDiagramChat, type ChatMessage } from './useDiagramChat';

export interface DiagramChatProps {
  /** The host's model call (see DiagramModel). */
  model: DiagramModel;
  /** Figures that can be attached, with their current code. */
  figures?: DiagramReference[];
  /** GitHub token for importing private repositories (or a higher API rate limit). */
  githubToken?: string;
  /** Attached figure ids (controlled). The first one is the figure being edited. */
  references?: string[];
  onReferencesChange?: (ids: string[]) => void;
  /** Initially attached figure ids when uncontrolled. */
  defaultReferences?: string[];
  /** A diagram is ready: update `target` or, when undefined, create a new figure. */
  onResult: (result: GenerateResult, target: DiagramReference | undefined) => void;
  /** Code as it streams in. */
  onDraft?: (code: string, target: DiagramReference | undefined) => void;
  /** Extra system instructions (house style, icon names of the host's pack, …). */
  instructions?: string;
  /** A saved conversation to continue. */
  initialMessages?: ChatMessage[];
  /** Called when a turn settles, for saving the conversation. */
  onMessagesChange?: (messages: ChatMessage[]) => void;
  onClose?: () => void;
  /** Puts text in the composer whenever `nonce` changes (e.g. a prompt typed elsewhere in the host). */
  prompt?: { text: string; nonce: number };
  colorScheme?: ColorScheme | 'system';
  themes?: Partial<Record<ColorScheme, Theme>>;
  className?: string;
  style?: CSSProperties;
}

const STARTERS: { type: DiagramType; label: string; hint: string; example: string }[] = [
  { type: 'flow', label: 'Architecture', hint: 'Services, clouds and how data moves', example: 'A serverless image upload pipeline on AWS' },
  { type: 'flow', label: 'Flowchart', hint: 'Steps, decisions and outcomes', example: 'Flowchart of a password reset, with the expired link case' },
  { type: 'erd', label: 'Data model', hint: 'Tables, columns and relationships', example: 'Data model for a multi-tenant project tracker' },
  { type: 'sequence', label: 'Sequence', hint: 'Who calls whom, in order', example: 'OAuth login between browser, app server and identity provider' },
];

const TYPE_LABEL: Record<DiagramType, string> = { flow: 'Architecture / flowchart', erd: 'Data model', sequence: 'Sequence', bpmn: 'Process (BPMN)' };

/** A chat panel that writes and edits diagrams through the host's model. */
export function DiagramChat(props: DiagramChatProps) {
  const { model, figures = [], onResult, onDraft, instructions, initialMessages, onMessagesChange, onClose, colorScheme = 'system', className, style } = props;
  const scheme = useResolvedScheme(colorScheme);
  const theme = props.themes?.[scheme] ?? builtInThemes[scheme];
  const cssVars = useMemo(() => themeCssVariables(theme) as CSSProperties, [theme]);

  const [ownRefs, setOwnRefs] = useState<string[]>(props.defaultReferences ?? []);
  const refIds = props.references ?? ownRefs;
  const setRefIds = (ids: string[]) => {
    if (!props.references) setOwnRefs(ids);
    props.onReferencesChange?.(ids);
  };
  const attached = refIds.map((id) => figures.find((f) => f.id === id)).filter((f): f is DiagramReference => !!f);

  const { messages, busy, send, cancel, reset } = useDiagramChat({ model, instructions, onResult, onDraft, initialMessages, onMessagesChange });
  const [draft, setDraft] = useState('');
  const [type, setType] = useState<DiagramType | undefined>();
  // Files to draw from (code, infrastructure, schemas, images).
  const [files, setFiles] = useState<DiagramAttachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  // Importing a GitHub repository: the URL field and whether a fetch is running.
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importRepo = async () => {
    if (!repoUrl?.trim() || importing) return;
    setFileError(null);
    setImporting(true);
    try {
      const { attachments, skipped, repo } = await attachmentsFromGitHub(repoUrl, { token: props.githubToken });
      if (!attachments.length) setFileError(`No usable text files in ${repo}.`);
      else {
        setFiles((all) => [...all.filter((a) => !attachments.some((b) => b.name === a.name)), ...attachments]);
        setRepoUrl(null);
        if (!draft.trim()) setDraft(`Draw the architecture of ${repo}`);
        if (skipped > 0) setFileError(`Attached ${attachments.length} files from ${repo}; skipped ${skipped}.`);
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
      input.current?.focus();
    }
  };
  const addFolder = async (list: Iterable<File>) => {
    setFileError(null);
    const { attachments, skipped } = await attachmentsFromFolder(list);
    if (!attachments.length) setFileError('No usable text files in that folder.');
    else {
      setFiles((all) => [...all.filter((a) => !attachments.some((b) => b.name === a.name)), ...attachments]);
      if (skipped > 0) setFileError(`Attached ${attachments.length} files; skipped ${skipped} (dependencies, build output, binaries, or over the size limit).`);
    }
    input.current?.focus();
  };
  const addFiles = async (list: Iterable<File>) => {
    setFileError(null);
    for (const file of list) {
      try {
        // A zip (e.g. a downloaded repository) is unpacked and attached like a folder.
        if (isZip(file)) {
          await addFolder(await filesFromZip(file));
          continue;
        }
        const attachment = await attachmentFromFile(file);
        setFiles((all) => [...all.filter((a) => a.name !== attachment.name), attachment]);
      } catch (error) {
        setFileError(error instanceof Error ? error.message : String(error));
      }
    }
    input.current?.focus();
  };
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.prompt) return;
    setDraft(props.prompt.text);
    input.current?.focus();
  }, [props.prompt?.nonce]);

  // Keep the newest message in view.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  // "@query" right before the caret opens the figure picker.
  const [caret, setCaret] = useState(0);
  const mention = /(^|\s)@([^\s@]*)$/.exec(draft.slice(0, caret));
  const candidates = mention ? figures.filter((f) => !refIds.includes(f.id) && f.label.toLowerCase().includes(mention[2]!.toLowerCase())) : [];
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [mention?.[2]]);

  const attach = (figure: DiagramReference) => {
    if (mention) {
      const start = caret - mention[2]!.length - 1;
      setDraft(draft.slice(0, start) + draft.slice(caret));
      setCaret(start);
    }
    setRefIds([...refIds, figure.id]);
    input.current?.focus();
  };

  const submit = () => {
    if (busy || (!draft.trim() && !files.length)) return;
    void send(draft, { references: attached, attachments: files, type });
    setDraft('');
    setType(undefined);
    setFiles([]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((a) => (a + (event.key === 'ArrowDown' ? 1 : candidates.length - 1)) % candidates.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        attach(candidates[active]!);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && busy) {
      cancel();
    } else if (event.key === 'Backspace' && !draft && (type || refIds.length || files.length)) {
      if (type) setType(undefined);
      else if (files.length) setFiles(files.slice(0, -1));
      else setRefIds(refIds.slice(0, -1));
    }
  };

  const labelOf = (id: string | undefined) => figures.find((f) => f.id === id)?.label ?? 'figure';

  return (
    <aside
      className={`odc-root${className ? ` ${className}` : ''}${dropping ? ' odc-dropping' : ''}`}
      style={{ ...cssVars, colorScheme: scheme, ...style }}
      aria-label="Diagram assistant"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        // A dropped folder is read recursively; plain files are attached as they are.
        const entries = [...e.dataTransfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => !!entry);
        if (entries.some((entry) => entry.isDirectory)) void filesFromEntries(entries).then(addFolder);
        else void addFiles(e.dataTransfer.files);
      }}
    >
      <style>{CSS}</style>
      <header className="odc-header">
        <span className="odc-title">
          <Spark /> Diagram assistant
        </span>
        <span className="odc-header-actions">
          {messages.length > 0 && (
            <button type="button" className="odc-ghost" onClick={reset} title="Start a new conversation">
              New chat
            </button>
          )}
          {onClose && (
            <button type="button" className="odc-ghost odc-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </span>
      </header>

      <div className="odc-log" ref={log}>
        {messages.length === 0 ? (
          <div className="odc-empty">
            <p className="odc-empty-title">{attached.length ? `Ask for a change to ${attached[0]!.label}` : 'Describe a diagram to draw'}</p>
            <p className="odc-empty-sub">{attached.length ? 'Or start something new:' : 'Pick a kind to get going, or just type.'}</p>
            <div className="odc-starters">
              <button type="button" className="odc-starter" onClick={() => picker.current?.click()}>
                <span className="odc-starter-label">From a file or image</span>
                <span className="odc-starter-hint">Terraform, SQL, code, a .zip, a whiteboard photo — or drop it here</span>
              </button>
              <button type="button" className="odc-starter" onClick={() => folderPicker.current?.click()}>
                <span className="odc-starter-label">From a folder</span>
                <span className="odc-starter-hint">A repository or infrastructure folder</span>
              </button>
              <button type="button" className="odc-starter odc-starter-wide" onClick={() => setRepoUrl('')}>
                <span className="odc-starter-label">From a GitHub repository</span>
                <span className="odc-starter-hint">Paste github.com/owner/repo — its infrastructure, schemas and code are read</span>
              </button>
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="odc-starter"
                  onClick={() => {
                    setType(s.type);
                    setRefIds([]);
                    setDraft(s.example);
                    input.current?.focus();
                  }}
                >
                  <span className="odc-starter-label">{s.label}</span>
                  <span className="odc-starter-hint">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (m.role === 'user' ? <UserBubble key={m.id} message={m} /> : <Answer key={m.id} message={m} targetLabel={labelOf(m.target)} />))
        )}
      </div>

      <div className="odc-composer">
        {candidates.length > 0 && (
          <div className="odc-picker" role="listbox" aria-label="Attach a figure">
            {candidates.map((f, i) => (
              <button key={f.id} type="button" role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => attach(f)}>
                <FigureGlyph /> {f.label}
              </button>
            ))}
          </div>
        )}
        {(attached.length > 0 || type || files.length > 0) && (
          <div className="odc-chips">
            {files.map((f) => (
              <span key={f.name} className="odc-chip odc-chip-file" title={f.kind === 'image' ? 'Image to recreate as a diagram' : `${classifyAttachment(f).label}${f.truncated ? ' (truncated)' : ''}`}>
                <FileGlyph image={f.kind === 'image'} />
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))}>
                  ×
                </button>
              </span>
            ))}
            {attached.map((f, i) => (
              <span key={f.id} className="odc-chip" title={i === 0 ? 'This figure will be edited' : 'Used as a reference'}>
                <FigureGlyph />
                {i === 0 ? 'Edit · ' : ''}
                {f.label}
                <button type="button" aria-label={`Detach ${f.label}`} onClick={() => setRefIds(refIds.filter((id) => id !== f.id))}>
                  ×
                </button>
              </span>
            ))}
            {type && (
              <span className="odc-chip odc-chip-type">
                {TYPE_LABEL[type]}
                <button type="button" aria-label="Clear diagram kind" onClick={() => setType(undefined)}>
                  ×
                </button>
              </span>
            )}
          </div>
        )}
        <textarea
          ref={input}
          className="odc-input"
          rows={3}
          value={draft}
          placeholder={attached.length ? `What should change in ${attached[0]!.label}?` : 'Describe a diagram…'}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files];
            if (!pasted.length) return;
            e.preventDefault();
            void addFiles(pasted);
          }}
        />
        {repoUrl !== null && (
          <form
            className="odc-repo"
            onSubmit={(e) => {
              e.preventDefault();
              void importRepo();
            }}
          >
            <input autoFocus value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="github.com/owner/repo" aria-label="GitHub repository URL" onKeyDown={(e) => e.key === 'Escape' && setRepoUrl(null)} />
            <button type="submit" className="odc-ghost" disabled={importing || !repoUrl.trim()}>
              {importing ? 'Reading…' : 'Import'}
            </button>
            <button type="button" className="odc-ghost" onClick={() => setRepoUrl(null)} aria-label="Cancel import">
              ×
            </button>
          </form>
        )}
        {fileError && <p className="odc-file-error">{fileError}</p>}
        <input
          ref={folderPicker}
          type="file"
          hidden
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            if (e.target.files) void addFolder(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          accept=".zip,.tf,.tfvars,.hcl,.yaml,.yml,.json,.sql,.prisma,.graphql,.gql,.ts,.tsx,.js,.jsx,.mjs,.py,.go,.java,.kt,.rb,.cs,.php,.rs,.swift,.scala,.ex,.c,.h,.cpp,.txt,.md,image/*"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="odc-composer-foot">
          <button type="button" className="odc-ghost odc-attach" onClick={() => picker.current?.click()} title="Attach code, a file or an image" aria-label="Attach a file">
            <FileGlyph />
          </button>
          <span className="odc-hint">{figures.length > 0 ? 'Type @ to attach a figure' : 'Enter to send · Shift+Enter for a new line'}</span>
          {busy ? (
            <button type="button" className="odc-send odc-stop" onClick={cancel}>
              Stop
            </button>
          ) : (
            <button type="button" className="odc-send" onClick={submit} disabled={!draft.trim() && !files.length}>
              {attached.length ? 'Update' : 'Draw'}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="odc-user">
      {((message.references?.length ?? 0) > 0 || (message.attachments?.length ?? 0) > 0) && (
        <div className="odc-user-refs">
          {message.references?.map((r) => (
            <span key={r.id} className="odc-chip odc-chip-small">
              <FigureGlyph />
              {r.label}
            </span>
          ))}
          {message.attachments?.map((a) => (
            <span key={a.name} className="odc-chip odc-chip-small">
              <FileGlyph image={a.kind === 'image'} />
              {a.name}
            </span>
          ))}
        </div>
      )}
      <p>{message.text}</p>
    </div>
  );
}

function Answer({ message, targetLabel }: { message: ChatMessage; targetLabel: string }) {
  const [open, setOpen] = useState(false);
  const lines = message.code ? message.code.split('\n').length : 0;
  const warnings = message.diagnostics?.length ?? 0;
  const status =
    message.status === 'writing'
      ? lines
        ? `Writing… ${lines} line${lines === 1 ? '' : 's'}`
        : 'Thinking…'
      : message.status === 'repairing'
        ? `Fixing ${warnings} problem${warnings === 1 ? '' : 's'}…`
        : message.status === 'done'
          ? message.target
            ? `Updated ${targetLabel}`
            : 'Drew a new diagram'
          : message.status === 'cancelled'
            ? 'Stopped'
            : "Couldn't draw that";
  const working = message.status === 'writing' || message.status === 'repairing';
  return (
    <div className={`odc-answer odc-answer-${message.status}`}>
      <div className="odc-answer-status">
        {working ? <span className="odc-spinner" aria-hidden="true" /> : <span className="odc-dot" aria-hidden="true" />}
        <span role="status">{status}</span>
        {message.status === 'done' && lines > 0 && (
          <button type="button" className="odc-link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide code' : `Code · ${lines} lines`}
          </button>
        )}
      </div>
      {message.text && <p className="odc-answer-text">{message.text}</p>}
      {message.status === 'done' && warnings > 0 && (
        <p className="odc-answer-note">
          {warnings} problem{warnings === 1 ? '' : 's'} left, see the code editor.
        </p>
      )}
      {(open || working) && message.code && <pre className="odc-code">{working ? message.code.split('\n').slice(-8).join('\n') : message.code}</pre>}
    </div>
  );
}

function Spark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

function FigureGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M10 6.5h4a2 2 0 0 1 2 2V14" />
    </svg>
  );
}

/** Every file under dropped folders, with webkitRelativePath-like paths. */
async function filesFromEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (out.length > 2000) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)).catch(() => null);
      if (file) out.push(Object.defineProperty(file, 'webkitRelativePath', { value: prefix + file.name }));
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject)).catch(() => []);
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

function FileGlyph({ image }: { image?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {image ? <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5h.01" /> : <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />}
    </svg>
  );
}

const CSS = `
.odc-root { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--od-color-raised); color: var(--od-color-text); font: var(--od-text-ui); border-left: 1px solid var(--od-color-border); }
.odc-root button { font: inherit; }
.odc-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--od-color-border); }
.odc-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.odc-title svg { color: var(--od-color-accent); }
.odc-header-actions { display: flex; gap: 4px; }
.odc-ghost { border: 0; background: none; color: var(--od-color-text-muted); padding: 3px 8px; border-radius: var(--od-radius-md); cursor: pointer; font-size: 12px; }
.odc-ghost:hover { background: var(--od-color-hover); color: var(--od-color-text); }
.odc-close { font-size: 18px; line-height: 1; padding: 2px 7px; }
.odc-log { flex: 1; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.odc-empty { margin-top: auto; }
.odc-empty-title { margin: 0; font-size: 15px; font-weight: 600; }
.odc-empty-sub { margin: 4px 0 12px; color: var(--od-color-text-muted); }
.odc-starters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.odc-starter { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 9px 10px; border: 1px solid var(--od-color-border); background: var(--od-color-surface); color: var(--od-color-text); border-radius: var(--od-radius-lg); cursor: pointer; }
.odc-starter:hover { border-color: var(--od-color-accent); }
.odc-starter-label { font-weight: 600; }
.odc-starter-hint { font-size: 11.5px; color: var(--od-color-text-muted); }
.odc-user { align-self: flex-end; max-width: 88%; background: var(--od-color-accent-soft); border-radius: var(--od-radius-lg) var(--od-radius-lg) 2px var(--od-radius-lg); padding: 8px 10px; }
.odc-user p { margin: 0; white-space: pre-wrap; }
.odc-user-refs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.odc-answer { align-self: stretch; }
.odc-answer-status { display: flex; align-items: center; gap: 7px; font-weight: 600; }
.odc-answer-error .odc-answer-status { color: var(--od-color-danger); }
.odc-answer-cancelled .odc-answer-status { color: var(--od-color-text-muted); }
.odc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--od-color-success); flex: none; }
.odc-answer-error .odc-dot { background: var(--od-color-danger); }
.odc-answer-cancelled .odc-dot { background: var(--od-color-text-subtle); }
.odc-spinner { width: 11px; height: 11px; border: 2px solid var(--od-color-accent-soft); border-top-color: var(--od-color-accent); border-radius: 50%; animation: odc-spin 800ms linear infinite; flex: none; }
@keyframes odc-spin { to { transform: rotate(360deg); } }
.odc-link { margin-left: auto; border: 0; background: none; color: var(--od-color-accent); cursor: pointer; font-size: 12px; font-weight: 500; padding: 0; }
.odc-answer-text { margin: 6px 0 0; color: var(--od-color-text-muted); white-space: pre-wrap; }
.odc-answer-note { margin: 6px 0 0; color: var(--od-color-warning); font-size: 12px; }
.odc-code { margin: 8px 0 0; padding: 8px 10px; max-height: 220px; overflow: auto; background: var(--od-color-surface); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-md); font: var(--od-text-code); font-size: 11.5px; white-space: pre; color: var(--od-color-text-muted); }
.odc-composer { position: relative; margin: 0 10px 10px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-lg); background: var(--od-color-surface); }
.odc-composer:focus-within { border-color: var(--od-color-accent); box-shadow: 0 0 0 3px var(--od-color-accent-soft); }
.odc-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 8px 0; }
.odc-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 4px 2px 7px; border-radius: 999px; background: var(--od-color-accent-soft); color: var(--od-color-accent); font-size: 12px; font-weight: 600; }
.odc-chip button { border: 0; background: none; color: inherit; cursor: pointer; padding: 0 4px; border-radius: 999px; font-size: 14px; line-height: 1; opacity: 0.7; }
.odc-chip button:hover { opacity: 1; background: var(--od-color-hover); }
.odc-chip-type { background: var(--od-color-hover); color: var(--od-color-text); }
.odc-chip-small { padding-right: 7px; background: var(--od-color-raised); }
.odc-input { display: block; width: 100%; box-sizing: border-box; resize: none; border: 0; outline: none; background: none; color: var(--od-color-text); font: var(--od-text-ui); font-size: 13.5px; padding: 9px 10px 4px; }
.odc-input::placeholder { color: var(--od-color-text-subtle); }
.odc-composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 6px 6px 10px; }
.odc-hint { font-size: 11.5px; color: var(--od-color-text-subtle); }
.odc-send { border: 0; border-radius: var(--od-radius-md); padding: 5px 12px; background: var(--od-color-accent); color: var(--od-color-on-accent); font-weight: 600; cursor: pointer; }
.odc-send:disabled { opacity: 0.45; cursor: default; }
.odc-stop { background: var(--od-color-text); }
.odc-picker { position: absolute; left: 0; right: 0; bottom: calc(100% + 4px); padding: 4px; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); box-shadow: var(--od-shadow-chrome); max-height: 200px; overflow-y: auto; }
.odc-picker button { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; border: 0; background: none; color: var(--od-color-text); padding: 6px 8px; border-radius: var(--od-radius-sm); cursor: pointer; }
.odc-picker button[aria-selected="true"], .odc-picker button:hover { background: var(--od-color-hover); }
@media (prefers-reduced-motion: reduce) { .odc-spinner { animation-duration: 2400ms; } }
.odc-starter-wide { grid-column: 1 / -1; border-style: dashed !important; }
.odc-dropping { box-shadow: inset 0 0 0 2px var(--od-color-accent); }
.odc-dropping .odc-log { background: var(--od-color-accent-soft); }
.odc-chip-file svg { flex: none; }
.odc-attach { display: inline-grid; place-items: center; padding: 4px 6px !important; }
.odc-file-error { margin: 4px 0 0; font-size: 12px; color: var(--od-color-danger); }
.odc-repo { display: flex; gap: 4px; margin-bottom: 6px; }
.odc-repo input { flex: 1; min-width: 0; height: 28px; padding: 0 8px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); background: var(--od-color-surface); color: var(--od-color-text); font: inherit; font-size: 12.5px; }
`;
