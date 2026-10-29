import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { darkTheme, lightTheme, listIconNames, loadFullIconCatalog, PALETTE_NAMES, type Theme } from '@octonote/octodraw';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

export const LANGUAGE_ID = '@octonote/octodraw';

monaco.languages.register({ id: LANGUAGE_ID });

monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/^\s*(direction|colorMode|styleMode|typeface|wrap|title|notation|autoNumber|activate|deactivate)\b/, 'keyword'],
      [/^\s*(loop|alt|opt|par|break|else|and)(?=\s*[[{])/, 'keyword'],
      [/^\s*(legend|flow)\b/, 'keyword'],
      [/"[^"]*"/, 'string'],
      [/\[/, { token: 'delimiter.bracket', next: '@props' }],
      [/(<>|-->|--|\s-\s|>|<)/, 'operator'],
      [/:.*?(?=\[|$)/, 'string.label'],
      [/[{}]/, 'delimiter.curly'],
      [/,/, 'delimiter'],
    ],
    props: [
      [/\]/, { token: 'delimiter.bracket', next: '@pop' }],
      [/[A-Za-z]+(?=\s*:)/, 'attribute.name'],
      [/"[^"]*"/, 'attribute.value'],
      [/:\s*[^,\]]+/, 'attribute.value'],
      [/,/, 'delimiter'],
    ],
  },
});

monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
  comments: { lineComment: '//' },
  brackets: [
    ['{', '}'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
  ],
  indentationRules: { increaseIndentPattern: /\{\s*$/, decreaseIndentPattern: /^\s*\}/ },
});

function defineTheme(name: string, theme: Theme, base: 'vs' | 'vs-dark') {
  const light = theme.scheme === 'light';
  monaco.editor.defineTheme(name, {
    base,
    inherit: true,
    rules: [
      { token: 'keyword', foreground: light ? '7c3aed' : 'c4b5fd', fontStyle: 'bold' },
      { token: 'operator', foreground: light ? 'db2777' : 'f9a8d4', fontStyle: 'bold' },
      { token: 'string.label', foreground: light ? '0f766e' : '5eead4' },
      { token: 'attribute.name', foreground: light ? '2563eb' : '93c5fd' },
      { token: 'attribute.value', foreground: light ? 'b45309' : 'fcd34d' },
      { token: 'comment', foreground: light ? 'a1a1aa' : '71717a', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': theme.color.surface,
      'editor.foreground': theme.color.text,
      'editorLineNumber.foreground': theme.color.textSubtle,
      'editorLineNumber.activeForeground': theme.color.textMuted,
      'editor.lineHighlightBackground': theme.color.hover,
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': theme.color.surface,
      'editorWidget.background': theme.color.raised,
      'editorWidget.border': theme.color.border,
      'editorSuggestWidget.background': theme.color.raised,
      'editorSuggestWidget.border': theme.color.border,
    },
  });
}
defineTheme('octodraw-light', lightTheme, 'vs');
defineTheme('octodraw-dark', darkTheme, 'vs-dark');

// Value completions for `[icon: ...]` and `[color: ...]`.
// Starts with the bundled core; grows to all of Eraser's icon names once the full catalog loads.
let ICON_NAMES = listIconNames();
void loadFullIconCatalog().then(() => {
  ICON_NAMES = listIconNames();
});
monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
  triggerCharacters: [':', ' ', '-'],
  provideCompletionItems(model, position) {
    const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
    const match = /\b(icon|color)\s*:\s*([\w-]*)$/.exec(before);
    if (!match) return { suggestions: [] };
    const typed = match[2]!;
    const range = new monaco.Range(position.lineNumber, position.column - typed.length, position.lineNumber, position.column);
    const values: readonly string[] = match[1] === 'icon' ? ICON_NAMES : PALETTE_NAMES;
    return {
      suggestions: values.map((value) => ({
        label: value,
        kind: match[1] === 'icon' ? monaco.languages.CompletionItemKind.Value : monaco.languages.CompletionItemKind.Color,
        insertText: value,
        range,
      })),
    };
  },
});

export { monaco };
