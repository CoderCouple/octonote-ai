import { useEffect, useRef } from 'react';
import type { Diagnostic } from '@octonote/octodraw';
import { LANGUAGE_ID, monaco } from './monaco';

interface Props {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  scheme: 'light' | 'dark';
  /** This user's selection as text offsets (null when the editor goes away), for presence. */
  onCursor?: (selection: { anchor: number; head: number } | null) => void;
  /** Collaborators in this text: drawn as coloured carets and selections. */
  peers?: { clientId: number | string; name: string; color: string; anchor: number; head: number }[];
}

const cssName = (id: number | string) => String(id).replace(/[^\w-]/g, '_');

export function CodeEditor({ value, onChange, diagnostics, scheme, onCursor, peers = [] }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;

  useEffect(() => {
    const instance = monaco.editor.create(host.current!, {
      value,
      language: LANGUAGE_ID,
      theme: scheme === 'dark' ? 'octodraw-dark' : 'octodraw-light',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontLigatures: false,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      padding: { top: 12 },
      tabSize: 2,
    });
    instance.onDidChangeModelContent(() => onChangeRef.current(instance.getValue()));
    instance.onDidChangeCursorSelection((event) => {
      const model = instance.getModel();
      if (!model || !instance.hasTextFocus()) return;
      const sel = event.selection;
      onCursorRef.current?.({ anchor: model.getOffsetAt({ lineNumber: sel.selectionStartLineNumber, column: sel.selectionStartColumn }), head: model.getOffsetAt(sel.getPosition()) });
    });

    editor.current = instance;
    return () => {
      onCursorRef.current?.(null);
      // Decorations belong to this instance (StrictMode creates the editor twice).
      decorations.current = null;
      instance.dispose();
    };
    // The editor is created once; later `value` changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = editor.current;
    const model = instance?.getModel();
    if (!instance || !model) return;
    const prev = model.getValue();
    if (prev === value) return;
    // Replace only the changed middle, so the cursor and undo history survive
    // edits that arrive from elsewhere (a collaborator, the assistant).
    let start = 0;
    while (start < prev.length && start < value.length && prev[start] === value[start]) start++;
    let end = 0;
    while (end < prev.length - start && end < value.length - start && prev[prev.length - 1 - end] === value[value.length - 1 - end]) end++;
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(prev.length - end);
    model.pushEditOperations(instance.getSelections() ?? [], [{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: value.slice(start, value.length - end) }], () => null);
  }, [value]);

  useEffect(() => monaco.editor.setTheme(scheme === 'dark' ? 'octodraw-dark' : 'octodraw-light'), [scheme]);

  useEffect(() => {
    const model = editor.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      '@octonote/octodraw',
      diagnostics.map((d) => ({
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.endColumn,
      })),
    );
  }, [diagnostics]);

  // Collaborators' carets and selections.
  const peerKey = JSON.stringify(peers);
  useEffect(() => {
    const instance = editor.current;
    const model = instance?.getModel();
    if (!instance || !model) return;
    decorations.current ??= instance.createDecorationsCollection();
    const length = model.getValueLength();
    decorations.current.set(
      peers.flatMap((p) => {
        const id = cssName(p.clientId);
        const head = model.getPositionAt(Math.min(p.head, length));
        const anchor = model.getPositionAt(Math.min(p.anchor, length));
        const caret: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(head.lineNumber, head.column, head.lineNumber, head.column),
          options: { beforeContentClassName: `odp-caret odp-caret-${id}`, hoverMessage: { value: p.name }, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
        };
        if (p.anchor === p.head) return [caret];
        const [from, to] = p.anchor < p.head ? [anchor, head] : [head, anchor];
        return [{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), options: { className: `odp-sel-${id}` } }, caret];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey, value]);
  const peerCss = peers
    .map((p) => {
      const id = cssName(p.clientId);
      return `.odp-caret-${id}{border-left:2px solid ${p.color}}.odp-caret-${id}::after{content:${JSON.stringify(p.name)};background:${p.color}}.odp-sel-${id}{background:${p.color}33}`;
    })
    .join('');

  return (
    <>
      <style>{`.odp-caret{position:relative;margin-left:-1px}.odp-caret::after{position:absolute;left:-2px;top:-14px;padding:0 4px;border-radius:3px 3px 3px 0;color:#fff;font:600 10px/14px system-ui,sans-serif;white-space:nowrap;pointer-events:none;z-index:1}${peerCss}`}</style>
      <div ref={host} style={{ height: '100%', width: '100%' }} />
    </>
  );
}
