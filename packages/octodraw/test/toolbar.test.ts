import { describe, expect, it } from 'vitest';
import { parseDiagram } from '../src';
import {
  actionToEdits,
  editableText,
  editRenames,
  headValue,
  lineValue,
  propertyValue,
  pruneSelection,
  runToolbarAction,
  selectionTarget,
  textSizeValue,
  toggleInSelection,
  toolbarControls,
  type DiagramSelection,
  type ToolbarAction,
  type ToolbarContext,
} from '../src/react/toolbar/actions';

const ctxOf = (source: string, icons: string[] = []): ToolbarContext => ({ diagram: parseDiagram(source), isIconNode: (id) => icons.includes(id) });
const node = (...ids: string[]): DiagramSelection => ({ kind: 'node', ids });
const edge = (...ids: string[]): DiagramSelection => ({ kind: 'edge', ids });

/** Runs an action and returns the new code (failing the test on a refusal). */
function run(source: string, action: ToolbarAction, selection: DiagramSelection, icons: string[] = []): string {
  const result = runToolbarAction(source, action, selection, ctxOf(source, icons));
  if (!result.ok) throw new Error(`refused: ${result.reason ?? 'no change'}`);
  expect(parseDiagram(result.source).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result.source;
}

describe('toolbarControls', () => {
  const src = 'Cloud [icon: aws] {\n  API [icon: server]\n  DB [icon: database]\n}\nWeb > API\nAPI > DB';
  const ctx = ctxOf(src, ['DB']);

  it('shows the box, icon node, group and arrow controls', () => {
    expect(toolbarControls(node('API'), ctx)).toEqual(['editText', 'shape', 'icon', 'color', 'border', 'text', 'more']);
    expect(toolbarControls(node('DB'), ctx)).toEqual(['editText', 'icon', 'color', 'iconSize', 'text', 'more']);
    expect(toolbarControls(node('Cloud'), ctx)).toEqual(['editText', 'icon', 'color', 'border', 'text', 'more']);
    expect(toolbarControls(edge('e0'), ctx)).toEqual(['editText', 'labelSize', 'routing', 'color', 'line', 'startArrow', 'endArrow', 'reverse', 'more']);
    expect(toolbarControls({ kind: 'label', ids: ['DB'] }, ctx)).toEqual(['editText', 'text', 'textColor', 'more']);
  });

  it('shows only the common controls for several boxes', () => {
    expect(toolbarControls(node('API', 'Web'), ctx)).toEqual(['count', 'icon', 'color', 'border', 'text', 'delete']);
    expect(toolbarControls(node('API', 'DB'), ctx)).toEqual(['count', 'icon', 'color', 'text', 'delete']);
    expect(toolbarControls(node('DB'), { ...ctx, isIconNode: () => true })).toContain('iconSize');
    expect(toolbarControls(node('API', 'DB'), { ...ctx, isIconNode: () => true })).toEqual(['count', 'icon', 'color', 'iconSize', 'text', 'delete']);
    expect(toolbarControls(edge('e0', 'e1'), ctx)[0]).toBe('count');
  });

  it('shows nothing for an empty or stale selection', () => {
    expect(toolbarControls(null, ctx)).toEqual([]);
    expect(toolbarControls(node('Gone'), ctx)).toEqual([]);
    expect(selectionTarget(node('Cloud'), ctx)).toBe('group');
  });
});

describe('values', () => {
  it('reports common and mixed values', () => {
    const src = 'A [color: blue]\nB [color: blue]\nC [color: red]';
    const ctx = ctxOf(src);
    expect(propertyValue(node('A', 'B'), ctx, 'color')).toEqual({ value: 'blue', mixed: false });
    expect(propertyValue(node('A', 'C'), ctx, 'color')).toEqual({ value: undefined, mixed: true });
    expect(textSizeValue(node('A'), ctx)).toEqual({ size: 14, mixed: false });
  });

  it('reads line style and arrowheads from the connector and properties', () => {
    const src = 'A > B\nB --> C\nC <> D [line: dotted, endArrow: dot]';
    const ctx = ctxOf(src);
    expect(lineValue(edge('e0'), ctx).value).toBe('solid');
    expect(lineValue(edge('e1'), ctx).value).toBe('dashed');
    expect(lineValue(edge('e2'), ctx).value).toBe('dotted');
    expect(lineValue(edge('e0', 'e1'), ctx).mixed).toBe(true);
    expect(headValue(edge('e2'), ctx, 'start').value).toBe('open');
    expect(headValue(edge('e2'), ctx, 'end').value).toBe('dot');
    expect(headValue(edge('e0'), ctx, 'start').value).toBe('none');
  });

  it('edit text starts from the name, or the label when there is one', () => {
    const src = 'API\nWeb [label: Website]\nWeb > API: calls';
    const ctx = ctxOf(src);
    expect(editableText(node('API'), ctx)).toBe('API');
    expect(editableText(node('Web'), ctx)).toBe('Website');
    expect(editableText(edge('e0'), ctx)).toBe('calls');
    expect(editRenames(node('API'), ctx)).toBe(true);
    expect(editRenames(node('Web'), ctx)).toBe(false);
  });
});

describe('actions', () => {
  it('colours a box, and Default removes the property', () => {
    const src = 'API [icon: server]';
    const blue = run(src, { type: 'set', key: 'color', value: 'blue' }, node('API'));
    expect(blue).toBe('API [icon: server, color: blue]');
    expect(run(blue, { type: 'set', key: 'color', value: null }, node('API'))).toBe('API [icon: server]');
  });

  it('declares an undeclared box to style it', () => {
    expect(run('Web > API', { type: 'set', key: 'color', value: 'green' }, node('API'))).toBe('Web > API\nAPI [color: green]');
  });

  it('styles several boxes in one change', () => {
    const plan = actionToEdits({ type: 'set', key: 'color', value: 'red' }, node('A', 'B'), ctxOf('A\nB'));
    expect('edits' in plan && plan.edits).toHaveLength(2);
    expect(run('A\nB', { type: 'set', key: 'color', value: 'red' }, node('A', 'B'))).toBe('A [color: red]\nB [color: red]');
  });

  it('writes default values as no property', () => {
    expect(run('A [shape: diamond]', { type: 'set', key: 'shape', value: 'rectangle' }, node('A'))).toBe('A');
    expect(run('A [border: dashed]', { type: 'set', key: 'border', value: 'solid' }, node('A'))).toBe('A');
    expect(run('A [textSize: 18]', { type: 'set', key: 'textSize', value: '14' }, node('A'))).toBe('A');
    expect(run('A [iconSize: large]', { type: 'set', key: 'iconSize', value: 'medium' }, node('A'))).toBe('A');
    expect(run('A [typeface: mono]', { type: 'set', key: 'typeface', value: 'clean' }, node('A'))).toBe('A');
    // Group titles default to 15, so 14 is written out.
    expect(run('G {\n  A\n}', { type: 'set', key: 'textSize', value: '14' }, node('G'))).toBe('G [textSize: 14] {\n  A\n}');
  });

  it('makes an arrow dashed through its connector, or `line:` when it has no dashed form', () => {
    expect(run('Web > API', { type: 'line', value: 'dashed' }, edge('e0'))).toBe('Web --> API');
    expect(run('Web --> API', { type: 'line', value: 'solid' }, edge('e0'))).toBe('Web > API');
    expect(run('Web - API', { type: 'line', value: 'dashed' }, edge('e0'))).toBe('Web -- API');
    expect(run('Web <> API', { type: 'line', value: 'dashed' }, edge('e0'))).toBe('Web <> API [line: dashed]');
    expect(run('Web <> API [line: dashed]', { type: 'line', value: 'solid' }, edge('e0'))).toBe('Web <> API');
    expect(run('Web > API', { type: 'line', value: 'dotted' }, edge('e0'))).toBe('Web > API [line: dotted]');
    expect(run('Web > API [line: dotted]', { type: 'line', value: 'dashed' }, edge('e0'))).toBe('Web --> API');
    expect(runToolbarAction('Web > API', { type: 'line', value: 'solid' }, edge('e0'), ctxOf('Web > API'))).toEqual({ ok: false });
  });

  it('sets arrowheads, writing the connector default as no property', () => {
    expect(run('Web > API', { type: 'arrowhead', end: 'start', value: 'dot' }, edge('e0'))).toBe('Web > API [startArrow: dot]');
    expect(run('Web > API [startArrow: dot]', { type: 'arrowhead', end: 'start', value: 'none' }, edge('e0'))).toBe('Web > API');
    expect(run('Web > API', { type: 'arrowhead', end: 'end', value: 'open' }, edge('e0'))).toBe('Web > API [endArrow: open]');
  });

  it('writes to every connection behind a merged arrow', () => {
    const src = 'G {\n  A\n  B\n}\nX > A\nX > B';
    const ctx: ToolbarContext = { diagram: parseDiagram(src), edgeSources: () => parseDiagram(src).edges };
    const result = runToolbarAction(src, { type: 'set', key: 'color', value: 'red' }, edge('e0'), ctx);
    expect(result.ok && result.source).toBe('G {\n  A\n  B\n}\nX > A [color: red]\nX > B [color: red]');
  });

  it('splits one arrow out of a multi-target line', () => {
    expect(run('Web > API, Auth', { type: 'set', key: 'color', value: 'red' }, edge('e1'))).toBe('Web > API\nWeb > Auth [color: red]');
  });

  it('reverses and relabels arrows', () => {
    expect(run('Web > API: calls', { type: 'reverse' }, edge('e0'))).toBe('API > Web: calls');
    expect(run('Web > API', { type: 'editText', text: 'calls' }, edge('e0'))).toBe('Web > API: calls');
    expect(run('Web > API: calls', { type: 'editText', text: '  ' }, edge('e0'))).toBe('Web > API');
  });

  it('renames a box everywhere and re-targets the selection', () => {
    const src = 'API [icon: server]\nWeb > API';
    const result = runToolbarAction(src, { type: 'editText', text: 'Gateway' }, node('API'), ctxOf(src));
    expect(result).toEqual({ ok: true, source: 'Gateway [icon: server]\nWeb > Gateway', label: 'Rename', selection: node('Gateway'), renamed: { from: 'API', to: 'Gateway' } });
  });

  it('sets `label:` instead of renaming when the box has one', () => {
    const result = runToolbarAction('API [label: Old]', { type: 'editText', text: 'New' }, node('API'), ctxOf('API [label: Old]'));
    expect(result).toMatchObject({ ok: true, source: 'API [label: New]', selection: node('API') });
    expect(result.ok && result.renamed).toBeUndefined();
  });

  it('edits an icon label like its box', () => {
    expect(run('DB [icon: database]', { type: 'editText', text: 'Store' }, { kind: 'label', ids: ['DB'] })).toBe('Store [icon: database]');
    expect(run('DB [icon: database]', { type: 'set', key: 'textColor', value: 'red' }, { kind: 'label', ids: ['DB'] })).toBe('DB [icon: database, textColor: red]');
  });

  it('refuses blank names and names that exist, changing nothing', () => {
    expect(runToolbarAction('A\nB', { type: 'editText', text: ' ' }, node('A'), ctxOf('A\nB'))).toEqual({ ok: false, reason: 'The text cannot be blank' });
    const taken = runToolbarAction('A\nB', { type: 'editText', text: 'B' }, node('A'), ctxOf('A\nB'));
    expect(taken.ok).toBe(false);
    expect(!taken.ok && taken.reason).toMatch(/already exists/);
  });

  it('is all or nothing across a multi-selection', () => {
    const src = 'A\nA [color: red]\nB';
    const result = runToolbarAction(src, { type: 'set', key: 'icon', value: 'server' }, node('B', 'A'), ctxOf(src));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/defined in 2 places/);
  });

  it('deletes arrows from the last one back, so ids stay valid', () => {
    const plan = actionToEdits({ type: 'delete' }, edge('e0', 'e2'), ctxOf('A > B\nB > C\nC > D'));
    expect('edits' in plan && plan.edits.map((e) => ('edgeId' in e ? e.edgeId : ''))).toEqual(['e2', 'e0']);
    expect(run('A > B\nB > C\nC > D', { type: 'delete' }, edge('e0', 'e2'))).toBe('A\nB > C\nD');
  });

  it('deletes boxes, skipping ones inside a selected group', () => {
    const src = 'G {\n  A\n}\nB\nA > B';
    const plan = actionToEdits({ type: 'delete' }, node('A', 'G'), ctxOf(src));
    expect('edits' in plan && plan.edits).toEqual([{ type: 'deleteNode', nodeId: 'G' }]);
    expect(run(src, { type: 'delete' }, node('A', 'G'))).toBe('B');
  });

  it('ungroups keeping the contents', () => {
    expect(run('G {\n  A\n  B\n}', { type: 'delete', keepContents: true }, node('G'))).toBe('A\nB');
  });

  it('sets group options from the More menu', () => {
    expect(run('G {\n  A\n}', { type: 'set', key: 'collapsed', value: 'true' }, node('G'))).toBe('G [collapsed: true] {\n  A\n}');
    expect(run('G [collapsed: true] {\n  A\n}', { type: 'set', key: 'collapsed', value: 'false' }, node('G'))).toBe('G {\n  A\n}');
    expect(run('A', { type: 'set', key: 'link', value: 'https://example.com/a' }, node('A'))).toBe('A [link: "https://example.com/a"]');
  });
});

describe('selection helpers', () => {
  it('shift-click toggles within a kind and starts over across kinds', () => {
    expect(toggleInSelection(null, 'node', 'A')).toEqual(node('A'));
    expect(toggleInSelection(node('A'), 'node', 'B')).toEqual(node('A', 'B'));
    expect(toggleInSelection(node('A', 'B'), 'node', 'A')).toEqual(node('B'));
    expect(toggleInSelection(node('A'), 'node', 'A')).toBeNull();
    expect(toggleInSelection(node('A'), 'edge', 'e0')).toEqual(edge('e0'));
  });

  it('drops ids that left the code', () => {
    const nodes = new Set(['A', 'B']);
    expect(pruneSelection(node('A', 'Gone'), nodes, new Set())).toEqual(node('A'));
    expect(pruneSelection(edge('e3'), nodes, new Set(['e0']))).toBeNull();
    const same = node('A');
    expect(pruneSelection(same, nodes, new Set())).toBe(same);
  });
});
