import { describe, expect, it } from 'vitest';
import { parseErd, parseSequence, renderSourceSvg } from '../src';
import { renamePlacements, type ViewPlacements } from '../src/layout/arrange';
import { ERD_COLLAPSED_KEY, erdCollapsedFrom, layoutErd, withErdCollapsed } from '../src/erd/erd';
import type { DiagramSelection } from '../src/react/toolbar/actions';
import {
  erdColumnKeyValue,
  erdColumnTypeValue,
  erdColumnUses,
  erdControls,
  erdEditableText,
  newColumnName,
  pruneErdSelection,
  runErdAction,
  type ErdToolbarAction,
} from '../src/react/toolbar/erd';
import {
  blockKindOptions,
  blockKindValue,
  directionOptions,
  messagesDeletedWith,
  pruneSequenceSelection,
  runSequenceAction,
  sequenceBlocks,
  sequenceControls,
  sequenceEditableText,
  sequencePropertyValue,
  type SequenceToolbarAction,
} from '../src/react/toolbar/sequence';
import { lightTheme } from '../src/theme/tokens';

const sel = (kind: DiagramSelection['kind'], ...ids: string[]): DiagramSelection => ({ kind, ids });

describe('ERD toolbar: columns', () => {
  const src = 'users {\n  id string pk\n  email string unique\n}\norders {\n  id uuid pk\n}\norders.userId > users.id';
  const diagram = parseErd(src);
  const run = (source: string, action: ErdToolbarAction, selection: DiagramSelection) => {
    const result = runErdAction(source, action, selection, parseErd(source));
    if (!result.ok) throw new Error(`refused: ${result.reason ?? 'no change'}`);
    expect(parseErd(result.source).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return result;
  };

  it('shows column and multi-column controls', () => {
    expect(erdControls(sel('column', 'users.email'), diagram)).toEqual(['editText', 'columnType', 'columnKeys', 'more']);
    expect(erdControls(sel('column', 'users.email', 'users.id'), diagram)).toEqual(['count', 'columnType', 'columnKeys', 'delete']);
    expect(erdControls(sel('column', 'users.nope'), diagram)).toEqual([]);
    // A column only named in a relationship is a column too.
    expect(erdControls(sel('column', 'orders.userId'), diagram)).toEqual(['editText', 'columnType', 'columnKeys', 'more']);
  });

  it('reports the type, flags and uses of the selected columns', () => {
    expect(erdColumnTypeValue(sel('column', 'users.email'), diagram)).toEqual({ value: 'string', mixed: false });
    expect(erdColumnTypeValue(sel('column', 'users.email', 'orders.id'), diagram).mixed).toBe(true);
    expect(erdColumnKeyValue(sel('column', 'users.id'), diagram, 'pk')).toEqual({ value: 'on', mixed: false });
    expect(erdColumnKeyValue(sel('column', 'users.id', 'users.email'), diagram, 'pk').mixed).toBe(true);
    expect(erdEditableText(sel('column', 'users.email'), diagram)).toBe('email');
    expect(erdColumnUses(sel('column', 'users.id'), diagram)).toBe(1);
    expect(newColumnName(diagram.entities.get('users')!)).toBe('column');
  });

  it('renames a column, following the selection', () => {
    const out = run(src, { type: 'editText', text: 'uid' }, sel('column', 'users.id'));
    expect(out.selection).toEqual(sel('column', 'users.uid'));
    expect(out.source).toContain('orders.userId > users.uid');
    expect(out).not.toHaveProperty('renamed');
  });

  it('sets the type and toggles flags on several columns at once', () => {
    expect(run(src, { type: 'columnType', value: 'text' }, sel('column', 'users.id', 'users.email')).source).toContain('  id text pk\n  email text unique');
    const off = run(src, { type: 'columnKey', key: 'unique', on: false }, sel('column', 'users.email'));
    expect(off.source).toContain('  email string\n');
    expect(off.label).toBe('Unmark unique');
    expect(runErdAction(src, { type: 'columnKey', key: 'fk', on: true }, sel('column', 'orders.userId'), diagram)).toMatchObject({ ok: false, reason: expect.stringMatching(/type first/) });
  });

  it('adds a column below the selected one or at the end of the selected table, selecting it', () => {
    const below = run(src, { type: 'addColumn' }, sel('column', 'users.id'));
    expect(below.source).toContain('  id string pk\n  column string\n  email string unique');
    expect(below.selection).toEqual(sel('column', 'users.column'));
    const end = run(below.source, { type: 'addColumn' }, sel('node', 'users'));
    expect(end.source).toContain('  email string unique\n  column_2 string\n}');
  });

  it('deletes columns, refusing one a relationship uses', () => {
    expect(run(src, { type: 'delete' }, sel('column', 'users.email')).source).not.toContain('email');
    expect(runErdAction(src, { type: 'delete' }, sel('column', 'users.id'), diagram)).toEqual({ ok: false, reason: "A relationship uses 'users.id'; delete it first" });
    expect(runErdAction(src, { type: 'set', key: 'color', value: 'red' }, sel('column', 'users.id'), diagram)).toMatchObject({ ok: false });
  });

  it('prunes columns that left the code', () => {
    expect(pruneErdSelection(sel('column', 'users.id', 'users.gone'), diagram)).toEqual(sel('column', 'users.id'));
    expect(pruneErdSelection(sel('column', 'gone.id'), diagram)).toBeNull();
  });
});

describe('ERD key columns are saved with the placements', () => {
  const src = 'users {\n  id string pk\n  name string\n  email string\n}\nposts {\n  id string pk\n  title string\n}';

  it('reads and writes the reserved placements level', () => {
    const placements: ViewPlacements = { '': { users: { x: 40, y: 40 } } };
    const saved = withErdCollapsed(placements, new Set(['users']));
    expect(saved).toEqual({ '': { users: { x: 40, y: 40 } }, [ERD_COLLAPSED_KEY]: { users: { x: 0, y: 0 } } });
    expect([...erdCollapsedFrom(saved)]).toEqual(['users']);
    expect(withErdCollapsed(saved, new Set())).toEqual(placements);
    expect(erdCollapsedFrom(undefined).size).toBe(0);
  });

  it('moves with a rename and is drawn by renderSourceSvg (thumbnails, export of parked figures)', async () => {
    const saved = withErdCollapsed({}, new Set(['users']));
    expect([...erdCollapsedFrom(renamePlacements(saved, { from: 'users', to: 'people' }))]).toEqual(['people']);
    const collapsed = await layoutErd(parseErd(src), { theme: lightTheme, collapsed: erdCollapsedFrom(saved) });
    expect(collapsed.tables.find((t) => t.entity.name === 'users')!.hidden).toBe(2);
    const plain = await renderSourceSvg(src, { theme: lightTheme });
    const folded = await renderSourceSvg(src, { theme: lightTheme, placements: saved });
    expect(plain.svg).toContain('>email<');
    expect(folded.svg).not.toContain('>email<');
    expect(folded.svg).toContain('2 more columns');
  });
});

describe('sequence toolbar: blocks and activations', () => {
  const src = 'A > B: start\nactivate B\nalt [label: ok, color: blue] {\n  B > C: yes\n}\nelse {\n  B --> A: no\n}\nloop {\n  A > B: again\n}\ndeactivate B';
  const diagram = parseSequence(src);
  const run = (source: string, action: SequenceToolbarAction, selection: DiagramSelection) => {
    const result = runSequenceAction(source, action, selection, parseSequence(source));
    if (!result.ok) throw new Error(`refused: ${result.reason ?? 'no change'}`);
    expect(parseSequence(result.source).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return result;
  };

  it('shows block, activation and multi-selection controls', () => {
    expect(sequenceControls(sel('block', 'b0'), diagram)).toEqual(['editText', 'blockKind', 'color', 'icon', 'more']);
    expect(sequenceControls(sel('block', 'b0', 'b1'), diagram)).toEqual(['count', 'color', 'icon', 'delete']);
    expect(sequenceControls(sel('activation', 'a0'), diagram)).toEqual(['tag', 'more']);
    expect(sequenceControls(sel('activation', 'a5'), diagram)).toEqual([]);
  });

  it('reports block values and the kinds it can switch to', () => {
    expect(sequenceBlocks(diagram).map((b) => [b.id, b.kind, b.sections, b.messages])).toEqual([
      ['b0', 'alt', 1, 2],
      ['b1', 'loop', 0, 1],
    ]);
    expect(blockKindValue(sel('block', 'b0'), diagram)).toEqual({ value: 'alt', mixed: false });
    expect(sequencePropertyValue(sel('block', 'b0'), diagram, 'color')).toEqual({ value: 'blue', mixed: false });
    expect(sequenceEditableText(sel('block', 'b0'), diagram)).toBe('ok');
    expect(messagesDeletedWith(sel('block', 'b0'), diagram)).toBe(2);
    expect(blockKindOptions(sequenceBlocks(diagram)[0]!).filter((o) => o.disabled).map((o) => o.value)).toEqual(['loop', 'opt', 'break']);
    expect(blockKindOptions(sequenceBlocks(diagram)[1]!).every((o) => !o.disabled)).toBe(true);
  });

  it('edits the label, kind, colour and icon of a block', () => {
    expect(run(src, { type: 'editText', text: 'approved' }, sel('block', 'b0')).source).toContain('alt [label: approved, color: blue] {');
    expect(run(src, { type: 'editText', text: '' }, sel('block', 'b0')).source).toContain('alt [color: blue] {');
    expect(run(src, { type: 'blockKind', value: 'par' }, sel('block', 'b0')).source).toContain('}\nand {');
    expect(run(src, { type: 'set', key: 'icon', value: 'clock' }, sel('block', 'b1')).source).toContain('loop [icon: clock] {');
    expect(runSequenceAction(src, { type: 'blockKind', value: 'opt' }, sel('block', 'b0'), diagram)).toMatchObject({ ok: false, reason: expect.stringMatching(/one section/) });
  });

  it('unwraps or deletes blocks, and deletes activations', () => {
    const unwrapped = run(src, { type: 'unwrap' }, sel('block', 'b1'));
    expect(unwrapped.source).toContain('}\nA > B: again\ndeactivate B');
    expect(unwrapped.selection).toBeNull();
    const deleted = run(src, { type: 'delete' }, sel('block', 'b0', 'b1'));
    expect(deleted.source).toBe('A > B: start\nactivate B\nC\ndeactivate B');
    expect(deleted.label).toBe('Delete 2 blocks');
    expect(run(src, { type: 'delete' }, sel('activation', 'a0')).source).not.toMatch(/activate/);
  });

  it('prunes blocks and activations that left the code', () => {
    expect(pruneSequenceSelection(sel('block', 'b1', 'b4'), diagram)).toEqual(sel('block', 'b1'));
    expect(pruneSequenceSelection(sel('activation', 'a3'), diagram)).toBeNull();
  });
});

describe('sequence toolbar: direction for several messages', () => {
  const src = 'activate A\nA > B: one\nB > C: two\nC --> A: three';
  const diagram = parseSequence(src);

  it('offers Forward / Back / Both ways, applied to each message', () => {
    expect(sequenceControls(sel('edge', 'm0', 'm1'), diagram)).toContain('direction');
    expect(directionOptions(null, diagram).map((o) => o.label)).toEqual(['Forward (as written)', 'Back', 'Both ways']);
    const out = runSequenceAction(src, { type: 'direction', value: 'both' }, sel('edge', 'm0', 'm1'), diagram);
    expect(out).toMatchObject({ ok: true, source: 'activate A\nA <> B: one\nB <> C: two\nC --> A: three' });
  });

  it('refuses the whole batch, naming the message that can not change', () => {
    const out = runSequenceAction(src, { type: 'direction', value: 'both' }, sel('edge', 'm0', 'm2'), diagram);
    expect(out).toEqual({ ok: false, reason: "Message 3 'three': A return can't point both ways; make it a call first" });
  });
});
