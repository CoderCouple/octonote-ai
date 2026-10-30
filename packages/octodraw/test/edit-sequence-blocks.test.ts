import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../../apps/octodraw-playground/src/examples';
import {
  applySequenceEdits,
  deleteActivation,
  deleteBlock,
  layoutSequence,
  parseSequence,
  parseSequenceWithSpans,
  sequenceActivations,
  setBlockKind,
  setBlockLabel,
  setBlockProperty,
  setMessageDirection,
  setMessageLine,
  unwrapBlock,
  type EditResult,
} from '../src';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';

/** The edited source, after checking the edit applied and added no diagnostics. */
function edited(before: string, result: EditResult): string {
  expect(result.reason).toBeUndefined();
  expect(result.changed).toBe(true);
  const messages = (source: string) => parseSequence(source).diagnostics.map((d) => d.message).sort();
  const old = messages(before);
  const added = messages(result.source).filter((m) => {
    const i = old.indexOf(m);
    if (i < 0) return true;
    old.splice(i, 1);
    return false;
  });
  expect(added).toEqual([]);
  return result.source;
}

const columns = (source: string) => [...parseSequence(source).participants.keys()];
const messages = (source: string) => parseSequence(source).events.flatMap((e) => (e.type === 'message' ? [`${e.from}${e.connector}${e.to}${e.label ? `:${e.label}` : ''}`] : []));
const blocks = (source: string) => parseSequence(source).events.flatMap((e) => (e.type === 'block-start' ? [`${e.kind}${e.label ? `:${e.label}` : ''}`] : e.type === 'block-section' ? ['|'] : []));

const SRC = `A > B: start
alt [label: ok] {
  B > C: yes
}
else [label: no] {
  B --> A: nope
}
loop [label: retry] {
  A > B: again
  opt {
    B > D: maybe
  }
}
`;

describe('block spans', () => {
  it('records each block with its opening, section and closing lines', () => {
    const { spans } = parseSequenceWithSpans(SRC);
    expect(spans.blocks.map((b) => [b.id, b.kind, b.parts.map((p) => [p.keyword.word, p.line, p.close])])).toEqual([
      ['b0', 'alt', [['alt', 2, 4], ['else', 5, 7]]],
      ['b1', 'loop', [['loop', 8, 13]]],
      ['b2', 'opt', [['opt', 10, 12]]],
    ]);
    const lines = SRC.split('\n');
    const p = spans.blocks[0]!.parts[0]!.props!;
    expect(lines[1]!.slice(p.column - 1, p.endColumn - 1)).toBe('[label: ok]');
  });

  it('gives the layout matching block and activation ids', () => {
    const src = 'activate A\nA > B: x\nactivate B\nB > A: y\ndeactivate B\ndeactivate A\nloop {\n  A > B: z\n}';
    const layout = layoutSequence(parseSequence(src));
    expect(layout.blocks.map((b) => b.id)).toEqual(['b0']);
    expect(layout.activations.map((a) => [a.id, a.participant]).sort()).toEqual([['a0', 'A'], ['a1', 'B']]);
    expect(sequenceActivations(parseSequence(src))).toEqual([
      { id: 'a0', participant: 'A', start: 0, end: 1 },
      { id: 'a1', participant: 'B', start: 1, end: 0 },
    ]);
  });
});

describe('block label, colour and icon', () => {
  it('sets, replaces and removes properties on the opening line', () => {
    const labelled = edited(SRC, setBlockLabel(SRC, 'b0', 'approved'));
    expect(labelled).toContain('alt [label: approved] {');
    expect(edited(SRC, setBlockLabel(SRC, 'b2', 'if busy'))).toContain('  opt [label: if busy] {');
    expect(edited(SRC, setBlockLabel(SRC, 'b0', null))).toContain('\nalt {\n');
    expect(edited(SRC, setBlockProperty(SRC, 'b1', 'color', 'blue'))).toContain('loop [label: retry, color: blue] {');
    expect(edited(SRC, setBlockProperty(SRC, 'b2', 'icon', 'clock'))).toContain('  opt [icon: clock] {');
    expect(parseSequence(edited(SRC, setBlockProperty(SRC, 'b1', 'color', 'blue'))).events.find((e) => e.type === 'block-start' && e.kind === 'loop')).toMatchObject({ properties: { color: 'blue' } });
    expect(setBlockLabel(SRC, 'b0', 'a "b"').reason).toMatch(/quotes/);
    expect(setBlockLabel(SRC, 'b9', 'x').reason).toMatch(/no block/);
  });

  it('refuses a block that was never closed (its line has an error)', () => {
    expect(setBlockLabel('loop {\n  A > B', 'b0', 'x').reason).toMatch(/Line 1 has an error/);
  });
});

describe('setBlockKind', () => {
  it('switches a one-section block to any kind', () => {
    expect(blocks(edited(SRC, setBlockKind(SRC, 'b1', 'break')))).toEqual(['alt:ok', '|', 'break:retry', 'opt']);
    expect(blocks(edited(SRC, setBlockKind(SRC, 'b2', 'alt')))).toEqual(['alt:ok', '|', 'loop:retry', 'alt']);
  });

  it('turns alt into par with its else sections becoming and', () => {
    const out = edited(SRC, setBlockKind(SRC, 'b0', 'par'));
    expect(out).toContain('par [label: ok] {');
    expect(out).toContain('and [label: no] {');
    expect(edited(out, setBlockKind(out, 'b0', 'alt'))).toBe(SRC);
  });

  it('refuses turning a block with sections into a one-section kind', () => {
    expect(setBlockKind(SRC, 'b0', 'loop').reason).toBe("A loop block has one section; this alt has 1 'else' section. Move or delete it in the code first");
    expect(setBlockKind(SRC, 'b0', 'alt')).toEqual({ source: SRC, changed: false });
    expect(setBlockKind(SRC, 'b0', 'nope' as never).reason).toMatch(/isn't a block/);
  });
});

describe('unwrapBlock', () => {
  it('removes the frame and dedents what was inside', () => {
    const out = edited(SRC, unwrapBlock(SRC, 'b1'));
    expect(out).toBe(`A > B: start
alt [label: ok] {
  B > C: yes
}
else [label: no] {
  B --> A: nope
}
A > B: again
opt {
  B > D: maybe
}
`);
    expect(messages(out)).toEqual(messages(SRC));
  });

  it('removes every section of an alt', () => {
    const out = edited(SRC, unwrapBlock(SRC, 'b0'));
    expect(out.startsWith('A > B: start\nB > C: yes\nB --> A: nope\nloop')).toBe(true);
    expect(blocks(out)).toEqual(['loop:retry', 'opt']);
  });
});

describe('deleteBlock', () => {
  it('deletes a block with its messages and nested blocks', () => {
    const out = edited(SRC, deleteBlock(SRC, 'b1'));
    expect(blocks(out)).toEqual(['alt:ok', '|']);
    expect(messages(out)).toEqual(['A>B:start', 'B>C:yes', 'B-->A:nope']);
  });

  it('keeps a declaration for participants first written inside, so columns stay', () => {
    const out = edited(SRC, deleteBlock(SRC, 'b2'));
    expect(columns(out)).toEqual(columns(SRC));
    expect(out).toContain('  D\n');
  });

  it('refuses when an activation crosses the block edge', () => {
    const src = 'A > B: x\nactivate B\nloop {\n  B > A: y\n  deactivate B\n}';
    expect(deleteBlock(src, 'b0').reason).toMatch(/activation on line 2 ends on line 5/);
    expect(edited(src, unwrapBlock(src, 'b0'))).toBe('A > B: x\nactivate B\nB > A: y\ndeactivate B');
  });
});

describe('deleteActivation', () => {
  const src = 'activate Server\nClient > Server: req\nactivate Server\nServer --> Client: res\ndeactivate Server\ndeactivate Server';

  it('removes the activate and the deactivate that ends it', () => {
    expect(edited(src, deleteActivation(src, 'a1'))).toBe('activate Server\nClient > Server: req\nServer --> Client: res\ndeactivate Server');
  });

  it('keeps a declaration when the activation is where a participant is first written', () => {
    const out = edited(src, deleteActivation(src, 'a0'));
    expect(out).toBe('Server\nClient > Server: req\nactivate Server\nServer --> Client: res\ndeactivate Server');
    expect(columns(out)).toEqual(['Server', 'Client']);
  });

  it('deletes an activation that is never closed, and refuses unknown ids', () => {
    expect(edited('A > B: x\nactivate B\nB > A: y', deleteActivation('A > B: x\nactivate B\nB > A: y', 'a0'))).toBe('A > B: x\nB > A: y');
    expect(deleteActivation(src, 'a7').reason).toMatch(/no activation/);
  });
});

describe('message connectors keep their spacing', () => {
  it('writes unspaced connectors unspaced, and dashes with spaces', () => {
    const src = 'activate A\nA>B: hi';
    expect(edited(src, setMessageDirection(src, 'm0', 'both'))).toBe('activate A\nA<>B: hi');
    expect(edited(src, setMessageLine(src, 'm0', 'return'))).toBe('activate A\nA --> B: hi');
  });
});

describe('several messages', () => {
  it('points every message the same way in one batch, or none', () => {
    const src = 'activate A\nA > B: one\nB > C: two\nC --> A: three';
    const out = applySequenceEdits(src, [
      { type: 'setMessageDirection', message: 'm0', direction: 'back' },
      { type: 'setMessageDirection', message: 'm1', direction: 'back' },
    ]);
    expect(out.source).toBe('activate A\nA < B: one\nB < C: two\nC --> A: three');
    const refused = applySequenceEdits(src, [
      { type: 'setMessageDirection', message: 'm0', direction: 'both' },
      { type: 'setMessageDirection', message: 'm2', direction: 'both' },
    ]);
    expect(refused).toMatchObject({ source: src, changed: false, reason: expect.stringMatching(/return/) });
  });
});

describe('block and activation edits over the templates and examples', () => {
  const sources = [FIGURE_TEMPLATES.find((t) => t.id === 'sequence')!.source, EXAMPLES['Sequence: checkout']!, SRC];
  it.each(sources.map((s, i) => [i, s] as const))('every block and activation edit parses cleanly (%i)', (_, src) => {
    const { spans, diagram } = parseSequenceWithSpans(src);
    const order = columns(src);
    for (const b of spans.blocks) {
      edited(src, setBlockLabel(src, b.id, 'edited label'));
      edited(src, setBlockProperty(src, b.id, 'color', 'teal'));
      for (const kind of ['loop', 'alt', 'opt', 'par', 'break'] as const) {
        const out = setBlockKind(src, b.id, kind);
        if (out.changed) expect(blocks(edited(src, out)).some((k) => k.startsWith(kind))).toBe(true);
      }
      const unwrapped = edited(src, unwrapBlock(src, b.id));
      expect(messages(unwrapped)).toEqual(messages(src));
      expect(columns(unwrapped)).toEqual(order);
      const gone = deleteBlock(src, b.id);
      if (gone.changed) expect(columns(edited(src, gone))).toEqual(order);
    }
    for (const a of sequenceActivations(diagram)) {
      const out = edited(src, deleteActivation(src, a.id));
      expect(columns(out)).toEqual(order);
      expect(messages(out)).toEqual(messages(src));
    }
  });
});
