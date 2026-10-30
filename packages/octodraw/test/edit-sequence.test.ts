import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../../apps/octodraw-playground/src/examples';
import {
  applySequenceEdits,
  deleteMessage,
  deleteParticipant,
  parseSequence,
  parseSequenceWithSpans,
  participantMessageCount,
  renameParticipant,
  setMessageDirection,
  setMessageLabel,
  setMessageLine,
  setMessageProperty,
  setParticipantProperty,
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
const messages = (source: string) =>
  parseSequence(source).events.flatMap((e) =>
    e.type === 'message' ? [`${e.from}${e.connector}${e.to}${e.label ? `:${e.label}` : ''}${Object.keys(e.properties).length ? JSON.stringify(e.properties) : ''}`] : [],
  );
const props = (source: string, name: string) => parseSequence(source).participants.get(name)?.properties;

describe('parseSequenceWithSpans', () => {
  it('records every mention, connector, label and [props]', () => {
    const src = '  Client [icon: monitor] --> "Web app": Click "Pay" [color: red]\nactivate "Web app"\nDB';
    const { spans } = parseSequenceWithSpans(src);
    const lines = src.split('\n');
    const at = (line: number, s: { column: number; endColumn: number } | undefined) => (s ? lines[line - 1]!.slice(s.column - 1, s.endColumn - 1) : undefined);
    const m = spans.messages[0]!;
    expect(m.id).toBe('m0');
    expect(at(1, m.from.nameSpan)).toBe('Client');
    expect(at(1, m.from.props)).toBe('[icon: monitor]');
    expect(at(1, m.from.range)).toBe('Client [icon: monitor]');
    expect(at(1, m.to.nameSpan)).toBe('"Web app"');
    expect(m.to.name).toBe('Web app');
    expect(at(1, m.connector)).toBe('-->');
    expect(at(1, m.label)).toBe('Click "Pay"');
    expect(at(1, m.props)).toBe('[color: red]');
    expect(spans.statements.map((s) => s.kind)).toEqual(['message', 'activate', 'declare']);
    expect(at(2, spans.statements[1]!.mentions[0]!.nameSpan)).toBe('"Web app"');
    expect(at(3, spans.statements[2]!.mentions[0]!.range)).toBe('DB');
  });

  it('gives the same diagram as parseSequence', () => {
    const src = EXAMPLES['Sequence: checkout']!;
    expect(parseSequenceWithSpans(src).diagram).toEqual(parseSequence(src));
  });
});

describe('setParticipantProperty', () => {
  it('changes a value where it is written', () => {
    const src = 'A [icon: user, color: red] > B: hi';
    expect(edited(src, setParticipantProperty(src, 'A', 'color', 'blue'))).toBe('A [icon: user, color: blue] > B: hi');
    expect(edited(src, setParticipantProperty(src, 'A', 'color', null))).toBe('A [icon: user] > B: hi');
    expect(edited('A [color: red] > B', setParticipantProperty('A [color: red] > B', 'A', 'color', null))).toBe('A > B');
  });

  it('adds to a declaration line, or to existing [props]', () => {
    expect(edited('B\nA > B', setParticipantProperty('B\nA > B', 'B', 'color', 'red'))).toBe('B [color: red]\nA > B');
    const src = 'A > B [icon: db]: hi';
    expect(edited(src, setParticipantProperty(src, 'B', 'color', 'red'))).toBe('A > B [icon: db, color: red]: hi');
  });

  it('declares a participant used only in messages before its first use', () => {
    const src = 'A > B\n  B > C: x';
    const out = edited(src, setParticipantProperty(src, 'C', 'color', 'red'));
    expect(out).toBe('A > B\n  C [color: red]\n  B > C: x');
    expect(columns(out)).toEqual(['A', 'B', 'C']);
    expect(edited(src, setParticipantProperty(src, 'A', 'icon', 'user'))).toBe('A [icon: user]\nA > B\n  B > C: x');
  });

  it('declares after the line when the participant written first is new there too', () => {
    const src = 'A > B: hi';
    const out = edited(src, setParticipantProperty(src, 'B', 'color', 'red'));
    expect(out).toBe('A > B: hi\nB [color: red]');
    expect(columns(out)).toEqual(['A', 'B']);
    expect(props(out, 'B')).toEqual({ color: 'red' });
  });

  it('refuses unknown participants and bad values', () => {
    expect(setParticipantProperty('A > B', 'Z', 'color', 'red').reason).toMatch(/no participant/);
    expect(setParticipantProperty('A > B', 'A', 'color', 'a"b').reason).toMatch(/quotes/);
    expect(setParticipantProperty('A > B', 'A', 'color', null)).toEqual({ source: 'A > B', changed: false });
  });
});

describe('renameParticipant', () => {
  it('renames messages, activations and declarations', () => {
    const src = 'Server [icon: server]\nClient > Server: hi\nactivate Server\nServer --> Client\ndeactivate Server';
    const out = edited(src, renameParticipant(src, 'Server', 'API'));
    expect(out).toBe('API [icon: server]\nClient > API: hi\nactivate API\nAPI --> Client\ndeactivate API');
  });

  it('quotes names with connectors, colons, brackets or a keyword in front', () => {
    for (const name of ['a > b', 'x: y', 'p [q]', 'a - b', 'title Thing', 'activate me']) {
      const out = edited('A > B', renameParticipant('A > B', 'B', name));
      expect(out).toBe(`A > "${name}"`);
      expect(columns(out)).toEqual(['A', name]);
    }
    expect(renameParticipant('A > B', 'B', 'Web app').source).toBe('A > Web app');
    expect(renameParticipant('A > "B c"', 'B c', 'D').source).toBe('A > "D"');
  });

  it('refuses blank, quoted and taken names', () => {
    expect(renameParticipant('A > B', 'B', ' ').reason).toMatch(/blank/);
    expect(renameParticipant('A > B', 'B', 'a"b').reason).toMatch(/quotes/);
    expect(renameParticipant('A > B', 'B', 'A').reason).toMatch(/already exists/);
  });
});

describe('deleteParticipant', () => {
  it('removes its messages, activations and declarations, keeping other columns', () => {
    const src = 'A > B: one\nactivate B\nB > C: two\nC > A: three\ndeactivate B';
    expect(participantMessageCount(parseSequence(src), 'B')).toBe(2);
    const out = edited(src, deleteParticipant(src, 'B'));
    expect(out).toBe('A\nC\nC > A: three');
    expect(columns(out)).toEqual(['A', 'C']);
  });

  it('keeps props written on a removed line', () => {
    const src = 'A > B\nB > C [color: red]';
    expect(edited(src, deleteParticipant(src, 'B'))).toBe('A\nC [color: red]');
  });
});

describe('messages', () => {
  it('sets, replaces and removes labels', () => {
    expect(edited('A > B', setMessageLabel('A > B', 'm0', 'hi'))).toBe('A > B: hi');
    expect(edited('A > B [icon: x]', setMessageLabel('A > B [icon: x]', 'm0', 'hi'))).toBe('A > B [icon: x]: hi');
    expect(setMessageLabel('A > B: hi', 'm0', 'yo').source).toBe('A > B: yo');
    expect(setMessageLabel('A > B: hi', 'm0', null).source).toBe('A > B');
    expect(setMessageLabel('A > B: hi [color: red]', 'm0', '').source).toBe('A > B: [color: red]');
    expect(setMessageLabel('A > B: [color: red]', 'm0', 'hi').source).toBe('A > B: hi [color: red]');
    expect(setMessageLabel('A > B', 'm0', 'x]').reason).toMatch(/']'/);
    expect(setMessageLabel('A > B', 'm0', 'x // y').reason).toMatch(/comment/);
    expect(setMessageLabel('A > B', 'm3', 'x').reason).toMatch(/no message/);
  });

  it('colours a message; without a label the colon keeps [props] off the participant', () => {
    const plain = edited('A > B', setMessageProperty('A > B', 'm0', 'color', 'red'));
    expect(plain).toBe('A > B: [color: red]');
    expect(messages(plain)).toEqual(['A>B{"color":"red"}']);
    expect(props(plain, 'B')).toEqual({});
    expect(setMessageProperty(plain, 'm0', 'color', null).source).toBe('A > B');
    expect(edited('A > B: hi', setMessageProperty('A > B: hi', 'm0', 'color', 'red'))).toBe('A > B: hi [color: red]');
    expect(setMessageProperty('A > B: hi [color: red]', 'm0', 'color', null).source).toBe('A > B: hi');
  });

  it('switches call and return keeping the direction', () => {
    expect(edited('A > B', setMessageLine('A > B', 'm0', 'return'))).toBe('A --> B');
    expect(edited('A --> B', setMessageLine('A --> B', 'm0', 'call'))).toBe('A > B');
    expect(edited('A - B', setMessageLine('A - B', 'm0', 'return'))).toBe('A -- B');
    // `<` has no dashed form: the ends swap; A is declared so the columns stay A, B.
    const out = edited('A < B: hi', setMessageLine('A < B: hi', 'm0', 'return'));
    expect(out).toBe('A\nB --> A: hi');
    expect(columns(out)).toEqual(['A', 'B']);
    expect(setMessageLine('A <> B', 'm0', 'return').reason).toMatch(/two-way/);
    expect(setMessageLine('A > B', 'm0', 'call')).toEqual({ source: 'A > B', changed: false });
  });

  it('points a message forward, back or both ways', () => {
    expect(edited('A > B', setMessageDirection('A > B', 'm0', 'back'))).toBe('A < B');
    expect(edited('A < B', setMessageDirection('A < B', 'm0', 'both'))).toBe('A <> B');
    expect(edited('A <> B', setMessageDirection('A <> B', 'm0', 'forward'))).toBe('A > B');
    expect(edited('A - B', setMessageDirection('A - B', 'm0', 'forward'))).toBe('A > B');
    // A return pointing back swaps its ends, keeping `-->`; B already exists, so no declaration.
    const src = 'B\nA --> B: ok';
    expect(edited(src, setMessageDirection(src, 'm0', 'back'))).toBe('B\nB --> A: ok');
    expect(setMessageDirection('A --> B', 'm0', 'both').reason).toMatch(/return/);
  });

  it('deletes a message, keeping participants first written or styled there', () => {
    const src = 'A [icon: user] > B: one\nB > C: two\nA > C: three';
    expect(edited(src, deleteMessage(src, 'm0'))).toBe('A [icon: user]\nB\nB > C: two\nA > C: three');
    expect(columns(deleteMessage(src, 'm0').source)).toEqual(['A', 'B', 'C']);
    expect(edited(src, deleteMessage(src, 'm2'))).toBe('A [icon: user] > B: one\nB > C: two');
    expect(edited(src, deleteMessage(src, 'm1'))).toBe('A [icon: user] > B: one\nC\nA > C: three');
  });

  it('applies a batch as one change, or nothing', () => {
    const src = 'A > B\nB > C';
    expect(
      applySequenceEdits(src, [
        { type: 'setMessageProperty', message: 'm0', key: 'color', value: 'red' },
        { type: 'setMessageProperty', message: 'm1', key: 'color', value: 'red' },
      ]).source,
    ).toBe('A > B: [color: red]\nB > C: [color: red]');
    expect(applySequenceEdits(src, [{ type: 'setMessageLabel', message: 'm0', label: 'x' }, { type: 'deleteMessage', message: 'm7' }]).changed).toBe(false);
  });
});

describe('round trip over the templates and examples', () => {
  const sources = [FIGURE_TEMPLATES.find((t) => t.id === 'sequence')!.source, EXAMPLES['Sequence: checkout']!];
  it.each(sources.map((s, i) => [i, s] as const))('every participant and message edit parses cleanly (%i)', (_, src) => {
    const diagram = parseSequence(src);
    const order = columns(src);
    for (const name of order) {
      const coloured = edited(src, setParticipantProperty(src, name, 'color', 'teal'));
      expect(props(coloured, name)!.color).toBe('teal');
      expect(columns(coloured)).toEqual(order);
      expect(columns(edited(src, setParticipantProperty(src, name, 'icon', 'cpu')))).toEqual(order);
      const renamed = edited(src, renameParticipant(src, name, `${name} 2`));
      expect(columns(renamed)).toEqual(order.map((n) => (n === name ? `${name} 2` : n)));
      const gone = edited(src, deleteParticipant(src, name));
      expect(columns(gone)).toEqual(order.filter((n) => n !== name));
    }
    const count = messages(src).length;
    for (let i = 0; i < count; i++) {
      const id = `m${i}`;
      const check = (out: string) => {
        expect(columns(out)).toEqual(order);
        expect(messages(out).length).toBe(count);
        return out;
      };
      check(edited(src, setMessageLabel(src, id, 'renamed')));
      const red = check(edited(src, setMessageProperty(src, id, 'color', 'teal')));
      expect(parseSequence(red).events.filter((e) => e.type === 'message')[i]).toMatchObject({ properties: { color: 'teal' } });
      for (const line of ['call', 'return'] as const) {
        const out = setMessageLine(src, id, line);
        if (out.changed) check(edited(src, out));
      }
      for (const direction of ['forward', 'back', 'both'] as const) {
        const out = setMessageDirection(src, id, direction);
        if (out.changed) check(edited(src, out));
      }
      const gone = edited(src, deleteMessage(src, id));
      expect(columns(gone)).toEqual(order);
      expect(messages(gone).length).toBe(count - 1);
    }
    void diagram;
  });
});
