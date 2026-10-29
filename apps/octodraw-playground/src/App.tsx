import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  DiagramChat,
  detectDiagramType,
  figureTitle,
  getItem,
  isCanvasDocument,
  OctoCanvas,
  themeCssVariables,
  themes,
  updateItem,
  diffDocuments,
  FIGURE_TEMPLATES,
  diagramServerStatus,
  httpDiagramModel,
  useVersionHistory,
  validateDiagram,
  VersionHistory,
  type CanvasDocument,
  type ChatMessage,
  type ColorScheme,
  type DiagramReference,
  type FigureItem,
  type GenerateResult,
  type IconSet,
  type OctoCanvasHandle,
} from '@octonote/octodraw';
import { claudeModel, CLAUDE_MODEL, demoModel } from './ai';
import { CodeEditor } from './CodeEditor';
import { EXAMPLES } from './examples';
import { UiIcon, type IconName } from './icons';
import { ROOM, startLiveRoom, usePlaygroundCanvas } from './live';
import { inIndexedDb, load, loadLarge, save, saveLarge } from './storage';

type ViewMode = 'code' | 'both' | 'canvas';
type SchemePreference = ColorScheme | 'system';

const KEYS = {
  canvas: 'octodraw.canvas',
  source: 'octodraw.source',
  mode: 'octodraw.mode',
  scheme: 'octodraw.scheme',
  width: 'octodraw.codeWidth',
  iconSet: 'octodraw.iconSet',
  assistant: 'octodraw.assistant',
  apiKey: 'octodraw.anthropicKey',
  chat: 'octodraw.chat',
};
const firstExample = Object.values(EXAMPLES)[0]!;
const noop = () => {};
const DIAGRAM_ROUTE = '/api/diagram';
/** People to @mention in the playground (octonote would pass the document's members). */
const TEAM = [
  { id: 'team-ada', name: 'Ada Lovelace' },
  { id: 'team-grace', name: 'Grace Hopper' },
  { id: 'team-linus', name: 'Linus Torvalds' },
  { id: 'team-margaret', name: 'Margaret Hamilton' },
];
const MIN_CODE_WIDTH = 280;

/** The saved canvas, or one figure holding the code saved by the single-diagram playground. */
/** ?figures=N: a generated canvas of N figures (all diagram kinds) for trying performance; not saved. */
const STRESS = Math.min(500, Number(new URLSearchParams(location.search).get('figures')) || 0);

function stressCanvas(count: number): CanvasDocument {
  const sources = [...Object.values(EXAMPLES), ...FIGURE_TEMPLATES.map((t) => t.source)];
  const columns = Math.ceil(Math.sqrt(count * 1.5));
  return {
    version: 1,
    items: Array.from({ length: count }, (_, i) => ({ id: `stress-${i}`, type: 'figure' as const, x: (i % columns) * 900, y: Math.floor(i / columns) * 700, w: 800, h: 560, source: sources[i % sources.length]!, autoSize: false })),
  };
}

function initialCanvas(): CanvasDocument {
  if (STRESS) return stressCanvas(STRESS);
  // Saved in IndexedDB (too big for localStorage): start empty, App loads it.
  if (inIndexedDb(KEYS.canvas)) return { version: 1, items: [] };
  try {
    const saved: unknown = JSON.parse(load(KEYS.canvas) ?? 'null');
    if (isCanvasDocument(saved)) return saved;
  } catch {
    // Start fresh.
  }
  return { version: 1, items: [{ id: 'first', type: 'figure', x: 0, y: 0, w: 720, h: 480, source: load(KEYS.source) ?? firstExample, autoSize: true }] };
}

export function App() {
  const { doc: liveDoc, change, undo, redo, peers, user, setPresence, versions: versionStore } = usePlaygroundCanvas(initialCanvas);
  // Version history: previewing a version shows it read-only in place of the live canvas.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const history = useVersionHistory({ doc: liveDoc, store: versionStore, user });
  const preview = previewId ? history.versions.find((v) => v.id === previewId) : undefined;
  // What the previewed version changed compared with the version before it; removed items come back as ghosts.
  const previewDiff = useMemo(() => {
    if (!preview) return undefined;
    const before = history.versions[history.versions.indexOf(preview) + 1];
    if (!before) return undefined;
    const diff = diffDocuments(before.doc, preview.doc);
    const removed = before.doc.items.filter((i) => diff.removed.includes(i.id));
    return {
      doc: removed.length ? { ...preview.doc, items: [...removed, ...preview.doc.items] } : preview.doc,
      ghosts: diff.removed,
      highlights: Object.fromEntries([...diff.added.map((id) => [id, '#30a46c']), ...diff.changed.map((id) => [id, '#f76b15']), ...diff.removed.map((id) => [id, '#e5484d'])]),
    };
  }, [preview, history.versions]);
  const previewHighlights = previewDiff?.highlights;
  const doc = previewDiff?.doc ?? preview?.doc ?? liveDoc;
  const [following, setFollowing] = useState<number | string | null>(null);
  const followed = following != null ? peers.find((p) => p.clientId === following) : undefined;
  // Tell others whom we follow; if they started following us after we started following them, we stop
  // (two views fitting each other would drift), so the newer follower wins.
  const followSince = useRef(0);
  useEffect(() => {
    followSince.current = followed ? Date.now() : 0;
    setPresence?.({ following: followed?.id ?? null, followingSince: followSince.current || undefined });
  }, [followed?.id, setPresence]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (followed && user && followed.following === user.id && (followed.followingSince ?? 0) > followSince.current) setFollowing(null);
  }, [followed, user]);
  // A live room keeps its own copy; the local canvas is left as it was.
  // Saved to localStorage, or IndexedDB once images make it too big (debounced: big documents are slow to serialise).
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const canvasLoaded = useRef(!inIndexedDb(KEYS.canvas));
  useEffect(() => {
    if (canvasLoaded.current) return;
    void loadLarge(KEYS.canvas).then((text) => {
      canvasLoaded.current = true;
      try {
        const saved: unknown = JSON.parse(text ?? 'null');
        if (isCanvasDocument(saved)) change(saved, { silent: true });
      } catch {
        // Keep the empty canvas.
      }
    });
  }, [change]);
  useEffect(() => {
    if (ROOM || STRESS || !canvasLoaded.current) return;
    const timer = setTimeout(() => {
      void saveLarge(KEYS.canvas, JSON.stringify(liveDoc)).then((where) =>
        setStorageNote(where === 'idb' ? 'This canvas is large (images), so it is saved in IndexedDB.' : where === 'failed' ? 'The canvas could not be saved: browser storage is full.' : null),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [liveDoc]);
  const [linkCopied, setLinkCopied] = useState(false);
  const people = useMemo(() => [...TEAM, ...peers.map((p) => ({ id: p.id, name: p.name }))], [peers]);
  // What octonote would do with a mention: notify the people. The playground just says so.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const canvasRef = useRef<OctoCanvasHandle>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [mode, setMode] = useState<ViewMode>(() => (load(KEYS.mode) as ViewMode | null) ?? 'both');
  const [schemePreference, setSchemePreference] = useState<SchemePreference>(() => (load(KEYS.scheme) as SchemePreference | null) ?? 'system');
  const [codeWidth, setCodeWidth] = useState(() => Number(load(KEYS.width)) || 440);
  const [iconSet, setIconSet] = useState<IconSet>(() => (load(KEYS.iconSet) === 'open' ? 'open' : 'eraser'));
  useEffect(() => save(KEYS.iconSet, iconSet), [iconSet]);
  const scheme = useResolvedScheme(schemePreference);
  const [assistantOpen, setAssistantOpen] = useState(() => load(KEYS.assistant) === 'open');
  const theme = themes[scheme];

  useEffect(() => save(KEYS.mode, mode), [mode]);
  useEffect(() => save(KEYS.scheme, schemePreference), [schemePreference]);

  // The figure whose code the editor shows: the selected figure, else the last one shown.
  const figuresOnCanvas = doc.items.filter((i): i is FigureItem => i.type === 'figure');
  const [activeId, setActiveId] = useState<string | null>(() => figuresOnCanvas[0]?.id ?? null);
  useEffect(() => {
    const selected = selection.length === 1 ? getItem(doc, selection[0]!) : undefined;
    if (selected?.type === 'figure') setActiveId(selected.id);
  }, [selection, doc]);
  const active = activeId ? (getItem(doc, activeId) as FigureItem | undefined) : undefined;
  const activeLabel = active ? (figureTitle(active.source) ?? 'Untitled figure') : undefined;

  // Writes always go to the live canvas (never to a version being previewed).
  const setFigureSource = useCallback(
    (id: string, source: string) => {
      if (!preview) change(updateItem(liveDoc, id, { source }), { silent: true });
    },
    [change, liveDoc, preview],
  );

  // Draw-in replays a figure like Eraser's AI output.
  const [drawIn, setDrawIn] = useState<{ id: string; nonce: number } | undefined>();
  const replayDrawIn = useCallback((id: string) => setDrawIn({ id, nonce: Date.now() }), []);
  const addFigure = useCallback(
    (source: string) => {
      const id = canvasRef.current?.insertFigure(source);
      if (!id) return;
      setActiveId(id);
      replayDrawIn(id);
    },
    [replayDrawIn],
  );

  // ⌘\ / Ctrl+\ collapses the code editor, and restores it when pressed again.
  const lastSplitMode = useRef<ViewMode>('both');
  const toggleCode = useCallback(() => {
    setMode((current) => {
      if (current === 'canvas') return lastSplitMode.current === 'canvas' ? 'both' : lastSplitMode.current;
      lastSplitMode.current = current;
      return 'canvas';
    });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        toggleCode();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setAssistantOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCode]);

  // Draggable divider between code and canvas.
  const resizing = useRef<{ startX: number; startWidth: number } | null>(null);
  const onDividerDown = (event: PointerEvent<HTMLDivElement>) => {
    resizing.current = { startX: event.clientX, startWidth: codeWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDividerMove = (event: PointerEvent<HTMLDivElement>) => {
    const r = resizing.current;
    if (!r) return;
    const max = Math.max(MIN_CODE_WIDTH, window.innerWidth - 360);
    setCodeWidth(Math.min(max, Math.max(MIN_CODE_WIDTH, r.startWidth + event.clientX - r.startX)));
  };
  const onDividerUp = () => {
    if (resizing.current) save(KEYS.width, String(codeWidth));
    resizing.current = null;
  };

  // Assistant: every figure on the canvas can be referenced; the active one is attached by default.
  useEffect(() => save(KEYS.assistant, assistantOpen ? 'open' : 'closed'), [assistantOpen]);
  const [apiKey, setApiKey] = useState(() => load(KEYS.apiKey) ?? '');
  const [references, setReferences] = useState<string[]>(() => (activeId ? [activeId] : []));
  const [chatPrompt, setChatPrompt] = useState<{ text: string; nonce: number } | undefined>();
  // Code streaming in from the model is shown in the editor; the canvas waits for the finished diagram.
  const [draft, setDraft] = useState<string | null>(null);
  // The server route (key kept on the server) when it's running with a key; else a key in this browser; else the demo.
  const [server, setServer] = useState<{ configured: boolean; model?: string } | null>(null);
  useEffect(() => {
    void diagramServerStatus(DIAGRAM_ROUTE).then((status) => setServer(status.ok ? status : null));
  }, [assistantOpen]);
  const model = useMemo(() => (server?.configured ? httpDiagramModel(DIAGRAM_ROUTE) : apiKey ? claudeModel(apiKey) : demoModel), [apiKey, server?.configured]);
  const figures = useMemo<DiagramReference[]>(
    () => figuresOnCanvas.map((f, i) => ({ id: f.id, label: figureTitle(f.source) ?? `Figure ${i + 1}`, source: f.source, type: detectDiagramType(f.source) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc],
  );
  const onResult = useCallback(
    (result: GenerateResult, target: DiagramReference | undefined) => {
      setDraft(null);
      if (target && getItem(liveDoc, target.id)) {
        change(updateItem(liveDoc, target.id, { source: result.source }));
        setActiveId(target.id);
        replayDrawIn(target.id);
        setReferences([target.id]);
      } else {
        addFigure(result.source);
      }
    },
    [liveDoc, change, replayDrawIn, addFigure],
  );
  useEffect(() => {
    // A newly created figure becomes the default reference.
    if (activeId && references.length === 0 && !assistantOpen) setReferences([activeId]);
  }, [activeId, references.length, assistantOpen]);
  const savedChat = useMemo<ChatMessage[] | undefined>(() => {
    try {
      return JSON.parse(load(KEYS.chat) ?? 'null') ?? undefined;
    } catch {
      return undefined;
    }
  }, [assistantOpen]);
  const saveChat = useCallback((messages: ChatMessage[]) => save(KEYS.chat, JSON.stringify(messages.slice(-40))), []);
  const askAi = useCallback((figureId: string | null, prompt?: string) => {
    setReferences(figureId ? [figureId] : []);
    if (prompt) setChatPrompt({ text: prompt, nonce: Date.now() });
    setAssistantOpen(true);
  }, []);
  // A caret belongs to one figure's code: drop it when the editor switches figures.
  useEffect(() => setPresence?.({ code: null }), [activeId, setPresence]);
  const restoreVersion = useCallback(
    (id: string) => {
      const restored = history.restore(id);
      if (restored) change(restored);
      setPreviewId(null);
    },
    [history, change],
  );
  const openCode = useCallback((id: string) => {
    setActiveId(id);
    // Phones show one pane at a time, so go straight to the code.
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    setMode((m) => (narrow ? 'code' : m === 'canvas' ? 'both' : m));
  }, []);

  const editorSource = draft ?? active?.source ?? '';
  const diagnostics = useMemo(() => (active && draft === null ? validateDiagram(active.source).diagnostics.filter((d) => d.message !== 'The diagram is empty') : []), [active, draft]);
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;
  const rootStyle = useMemo(() => themeCssVariables(theme) as CSSProperties, [theme]);

  return (
    <div className="app" data-mode={mode} data-scheme={scheme} style={{ ...rootStyle, colorScheme: scheme, ['--code-width' as string]: `${codeWidth}px` }}>
      <header className="topbar">
        <div className="topbar-start">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" />
            octodraw
          </span>
          <span className="topbar-sep" />
          <label className="select">
            <span className="visually-hidden">Add an example figure</span>
            <select
              value=""
              onChange={(e) => {
                const example = EXAMPLES[e.target.value];
                if (example) addFigure(example);
              }}
            >
              <option value="" disabled>
                Add example
              </option>
              {Object.keys(EXAMPLES).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <UiIcon name="chevronDown" size={14} />
          </label>
        </div>

        <div className="segmented" role="tablist" aria-label="Layout">
          {(
            [
              ['code', 'Code', 'code'],
              ['both', 'Both', 'columns'],
              ['canvas', 'Canvas', 'canvas'],
            ] as [ViewMode, string, IconName][]
          ).map(([value, label, icon]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} data-value={value} data-wide-only={value === 'both' ? '' : undefined} onClick={() => setMode(value)} title={value === 'canvas' ? 'Hide code (⌘\\)' : undefined}>
              <UiIcon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="topbar-end">
          {ROOM ? (
            <div className="live" title={`Live room “${ROOM}”: open this link in another tab to edit together`}>
              <span className="live-dot" aria-hidden="true" />
              <span className="live-people">
                <span className="live-avatar" style={{ background: user!.color }} title={`${user!.name} (you)`}>
                  {user!.name.slice(0, 1)}
                </span>
                {peers.map((p) => (
                  <button
                    key={p.clientId}
                    type="button"
                    className="live-avatar"
                    aria-pressed={following === p.clientId}
                    style={{ background: p.color }}
                    title={following === p.clientId ? `Following ${p.name}: click to stop` : `Follow ${p.name}'s view`}
                    onClick={() => setFollowing((f) => (f === p.clientId ? null : p.clientId))}
                  >
                    {p.name.slice(0, 1)}
                  </button>
                ))}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Copy link to this live room"
                title="Copy link to this live room"
                onClick={() => {
                  void navigator.clipboard?.writeText(location.href);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }}
              >
                <UiIcon name={linkCopied ? 'check' : 'link'} size={15} />
              </button>
            </div>
          ) : (
            <button type="button" className="ghost-button" onClick={startLiveRoom} title="Edit this canvas together: opens a live room you can share with other tabs">
              Go live
            </button>
          )}
          <button
            type="button"
            className="ghost-button"
            aria-pressed={historyOpen}
            onClick={() => {
              setHistoryOpen((o) => !o);
              setPreviewId(null);
              setAssistantOpen(false);
            }}
            title="Version history: save, preview and restore versions"
          >
            History
          </button>
          <button type="button" className="ghost-button" onClick={() => active && replayDrawIn(active.id)} disabled={!active} title="Replay the selected figure drawing itself in">
            Draw in
          </button>
          <button type="button" className="generate" onClick={() => (setHistoryOpen(false), setPreviewId(null), setAssistantOpen((o) => !o))} aria-pressed={assistantOpen} title="Ask AI to draw or change a figure (⌘J)">
            <UiIcon name="sparkles" size={14} />
            Assistant
          </button>
          <label className="select">
            <span className="select-label">Icons</span>
            <select value={iconSet} onChange={(e) => setIconSet(e.target.value as IconSet)}>
              <option value="eraser">Eraser</option>
              <option value="open">Open source</option>
            </select>
            <UiIcon name="chevronDown" size={14} />
          </label>
          <div className="segmented segmented-icons" role="radiogroup" aria-label="Color scheme">
            {(
              [
                ['light', 'Light', 'sun'],
                ['dark', 'Dark', 'moon'],
                ['system', 'System', 'monitor'],
              ] as [SchemePreference, string, IconName][]
            ).map(([value, label, icon]) => (
              <button key={value} type="button" role="radio" aria-checked={schemePreference === value} aria-label={label} title={label} onClick={() => setSchemePreference(value)}>
                <UiIcon name={icon} size={14} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="code-pane" aria-label="Figure code" hidden={mode === 'canvas'}>
          <div className="pane-header">
            <span className="pane-title">{active ? activeLabel : 'Diagram as code'}</span>
            <button type="button" className="icon-button" onClick={toggleCode} aria-label="Collapse code editor" title="Collapse (⌘\)">
              <UiIcon name="panelClose" />
            </button>
          </div>
          {active ? (
            <>
              <div className="editor-host">
                <CodeEditor value={editorSource} onChange={draft === null ? (next) => setFigureSource(active.id, next) : () => {}} diagnostics={diagnostics}
                  scheme={scheme}
                  onCursor={setPresence ? (sel) => setPresence({ code: sel && { item: active.id, ...sel } }) : undefined}
                  peers={peers.flatMap((p) => (p.code?.item === active.id ? [{ clientId: p.clientId, name: p.name, color: p.color, anchor: p.code.anchor, head: p.code.head }] : []))}
                />
              </div>
              <footer className="pane-footer">
                {errors > 0 && <span className="status status-error">● {errors} error{errors > 1 ? 's' : ''}</span>}
                {warnings > 0 && <span className="status status-warning">● {warnings} warning{warnings > 1 ? 's' : ''}</span>}
                {diagnostics.length === 0 && <span className="status status-ok">● No problems</span>}
              </footer>
            </>
          ) : (
            <div className="code-empty">
              <p>Select a figure on the canvas to edit its code.</p>
              <button type="button" className="ghost-button" onClick={() => addFigure(firstExample)}>
                New figure
              </button>
            </div>
          )}
        </section>

        {mode === 'both' && <div className="divider" role="separator" aria-orientation="vertical" aria-label="Resize code editor" onPointerDown={onDividerDown} onPointerMove={onDividerMove} onPointerUp={onDividerUp} onPointerCancel={onDividerUp} />}

        <section className="canvas-pane" aria-label="Canvas" hidden={mode === 'code'}>
          <OctoCanvas
            ref={canvasRef}
            doc={doc}
            onChange={preview ? noop : change}
            readOnly={!!preview}
            highlights={previewHighlights}
            ghosts={previewDiff?.ghosts}
            following={following}
            onStopFollowing={() => setFollowing(null)}
            onUndo={undo}
            onRedo={redo}
            selection={selection}
            onSelectionChange={setSelection}
            onOpenFigure={openCode}
            onAskAi={askAi}
            drawIn={drawIn}
            peers={peers}
            onPresenceChange={setPresence}
            user={user}
            people={people}
            onMention={({ mentioned }) => setNotice(`Would notify ${mentioned.map((p) => p.name).join(', ')} (octonote sends the notification)`)}
            colorScheme={scheme}
            iconSet={iconSet}
            style={{ width: '100%', height: '100%' }}
          />
          {notice && <div className="canvas-toast" role="status">{notice}</div>}
          {storageNote && !notice && storageNote.startsWith('The canvas could not') && <div className="canvas-toast" role="alert">{storageNote}</div>}
          {preview && (
            <div className="canvas-banner">
              Viewing {preview.name ?? `the version from ${new Date(preview.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
              {previewHighlights && Object.keys(previewHighlights).length > 0 && (
                <span className="banner-legend">
                  <i style={{ background: '#30a46c' }} /> added <i style={{ background: '#f76b15' }} /> edited <i style={{ background: '#e5484d' }} /> removed
                </span>
              )}
              <button type="button" className="generate" onClick={() => restoreVersion(preview.id)}>
                Restore
              </button>
              <button type="button" className="ghost-button" onClick={() => setPreviewId(null)}>
                Back to current
              </button>
            </div>
          )}
          {!preview && followed && (
            <div className="canvas-banner" style={{ borderColor: followed.color }}>
              <span className="live-dot" style={{ background: followed.color }} /> Following {followed.name}
              <button type="button" className="ghost-button" onClick={() => setFollowing(null)}>
                Stop
              </button>
            </div>
          )}
          {mode === 'canvas' && active && (
            <button type="button" className="reopen-code" onClick={toggleCode} title="Show code (⌘\)">
              <UiIcon name="code" size={14} />
              Code
              {errors > 0 && <span className="badge">{errors}</span>}
            </button>
          )}
        </section>

        {historyOpen && (
          <div className="assistant-pane">
            <VersionHistory
              versions={history.versions}
              current={liveDoc}
              selected={previewId}
              onSelect={setPreviewId}
              onRestore={restoreVersion}
              onSave={(name) => history.save(name || undefined)}
              onRename={history.rename}
              onRemove={(id) => {
                history.remove(id);
                if (previewId === id) setPreviewId(null);
              }}
              onClose={() => (setHistoryOpen(false), setPreviewId(null))}
              colorScheme={scheme}
            />
          </div>
        )}
        {assistantOpen && (
          <div className="assistant-pane">
            <DiagramChat
              model={model}
              figures={figures}
              references={references}
              onReferencesChange={setReferences}
              onDraft={(code, target) => {
                if (target) setActiveId(target.id);
                setDraft(code);
              }}
              onResult={onResult}
              initialMessages={savedChat}
              onMessagesChange={saveChat}
              prompt={chatPrompt}
              onClose={() => setAssistantOpen(false)}
              colorScheme={scheme}
              style={{ flex: 1, minHeight: 0 }}
            />
            <AssistantSettings apiKey={apiKey} server={server} onChange={(key) => (setApiKey(key), save(KEYS.apiKey, key))} />
          </div>
        )}
      </main>
    </div>
  );
}

function AssistantSettings({ apiKey, server, onChange }: { apiKey: string; server: { configured: boolean; model?: string } | null; onChange: (key: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(apiKey);
  if (server?.configured) {
    return (
      <div className="assistant-settings">
        <span>Claude ({server.model}) via the server</span>
        <span className="assistant-settings-note">Key kept on the server</span>
      </div>
    );
  }
  if (!editing) {
    return (
      <div className="assistant-settings">
        <span>{apiKey ? `Claude (${CLAUDE_MODEL})` : 'Demo responses'}</span>
        <button type="button" className="link-button" onClick={() => (setValue(apiKey), setEditing(true))}>
          {apiKey ? 'Change key' : 'Use Claude'}
        </button>
      </div>
    );
  }
  return (
    <form
      className="assistant-settings assistant-settings-edit"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(value.trim());
        setEditing(false);
      }}
    >
      <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Anthropic API key (sk-ant-…)" autoFocus aria-label="Anthropic API key" />
      <button type="submit" className="link-button">
        Save
      </button>
      {apiKey && (
        <button type="button" className="link-button" onClick={() => (onChange(''), setEditing(false))}>
          Remove
        </button>
      )}
      <p>Stored only in this browser and sent only to api.anthropic.com. Better: run the server route (<code>pnpm dev:server</code> with ANTHROPIC_API_KEY in packages/octodraw-server/.env), which keeps the key off the browser.</p>
    </form>
  );
}

function useResolvedScheme(preference: SchemePreference): ColorScheme {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [system, setSystem] = useState<ColorScheme>(query.matches ? 'dark' : 'light');
  useEffect(() => {
    const update = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [query]);
  return preference === 'system' ? system : preference;
}
