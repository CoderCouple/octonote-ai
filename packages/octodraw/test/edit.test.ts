import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyEdits,
  declareNode,
  deleteEdge,
  deleteNode,
  parseDiagram,
  renameNode,
  reverseEdge,
  setEdgeConnector,
  setEdgeLabel,
  setEdgeProperty,
  setNodeProperty,
  type EditResult,
} from '../src';

/** The edited source, after checking the edit applied and added no diagnostics. */
function edited(before: string, result: EditResult): string {
  expect(result.reason).toBeUndefined();
  expect(result.changed).toBe(true);
  const messages = (source: string) => parseDiagram(source).diagnostics.map((d) => d.message).sort();
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

const edgesOf = (source: string) =>
  parseDiagram(source).edges.map((e) => `${e.from}${e.connector}${e.to}${e.label ? `:${e.label}` : ''}${Object.keys(e.properties).length ? JSON.stringify(e.properties) : ''}`);

describe('setNodeProperty', () => {
  it('appends a property, keeping order', () => {
    const src = 'API [icon: server]';
    expect(edited(src, setNodeProperty(src, 'API', 'color', 'blue'))).toBe('API [icon: server, color: blue]');
  });

  it('adds brackets to a bare declaration and replaces an existing value', () => {
    expect(setNodeProperty('API', 'API', 'color', 'blue').source).toBe('API [color: blue]');
    expect(setNodeProperty('API [color: red, icon: x]', 'API', 'color', 'blue').source).toBe('API [color: blue, icon: x]');
  });

  it('removes a property, and the brackets with the last one', () => {
    const src = 'API [icon: server, color: blue]';
    expect(edited(src, setNodeProperty(src, 'API', 'color', null))).toBe('API [icon: server]');
    expect(setNodeProperty(src, 'API', 'icon', null).source).toBe('API [color: blue]');
    expect(setNodeProperty('API [color: blue]', 'API', 'color', null).source).toBe('API');
    expect(setNodeProperty('API [a: 1, color: blue, b: 2]', 'API', 'color', null).source).toBe('API [a: 1, b: 2]');
  });

  it('is a no-op when the value is already set or missing', () => {
    expect(setNodeProperty('API [color: blue]', 'API', 'color', 'blue')).toEqual({ source: 'API [color: blue]', changed: false });
    expect(setNodeProperty('API', 'API', 'color', null)).toEqual({ source: 'API', changed: false });
    expect(setNodeProperty('A > B', 'B', 'color', null)).toEqual({ source: 'A > B', changed: false });
  });

  it('quotes values the parser would split', () => {
    const src = 'API';
    const out = edited(src, setNodeProperty(src, 'API', 'description', 'a, b: [c]'));
    expect(out).toBe('API [description: "a, b: [c]"]');
    expect(parseDiagram(out).nodes.get('API')?.properties.description).toBe('a, b: [c]');
    expect(setNodeProperty(src, 'API', 'link', 'https://x.io').source).toBe('API [link: "https://x.io"]');
    expect(setNodeProperty(src, 'API', 'label', ' padded ').source).toBe('API [label: " padded "]');
    expect(parseDiagram(setNodeProperty(src, 'API', 'description', 'two\nlines').source).nodes.get('API')?.properties.description).toBe('two\nlines');
  });

  it('keeps indentation, trailing comments and other lines', () => {
    const src = 'VPC {\n    API [icon: server] // the api\n\n    DB\n}\n// end';
    expect(edited(src, setNodeProperty(src, 'API', 'color', 'red'))).toBe('VPC {\n    API [icon: server, color: red] // the api\n\n    DB\n}\n// end');
  });

  it('styles a group on its opening line', () => {
    const src = 'Cloud {\n  A\n}';
    expect(edited(src, setNodeProperty(src, 'Cloud', 'color', 'blue'))).toBe('Cloud [color: blue] {\n  A\n}');
    const one = 'G { A, B }';
    expect(edited(one, setNodeProperty(one, 'G', 'icon', 'aws'))).toBe('G [icon: aws] { A, B }');
  });

  it('gives one name of a shared declaration its own line', () => {
    const src = '  A, B, C [color: red]';
    const out = edited(src, setNodeProperty(src, 'B', 'icon', 'x'));
    expect(out).toBe('  A [color: red]\n  B [color: red, icon: x]\n  C [color: red]');
    expect([...parseDiagram(out).nodes.keys()]).toEqual(['A', 'B', 'C']);
    expect(setNodeProperty('A, B', 'A', 'color', 'red').source).toBe('A [color: red]\nB');
  });

  it('declares an undeclared node next to its first use, in its group', () => {
    const src = 'Web > API\nAPI > DB';
    expect(edited(src, setNodeProperty(src, 'API', 'color', 'blue'))).toBe('Web > API\nAPI [color: blue]\nAPI > DB');
    const grouped = 'G {\n  Web > API // calls\n}';
    const out = edited(grouped, setNodeProperty(grouped, 'API', 'color', 'blue'));
    expect(out).toBe('G {\n  Web > API // calls\n  API [color: blue]\n}');
    expect(parseDiagram(out).nodes.get('API')).toMatchObject({ parent: 'G', implicit: false, properties: { color: 'blue' } });
  });

  it('keeps a declaration inside a one-line group', () => {
    const src = 'G { Web > API }';
    const out = edited(src, setNodeProperty(src, 'API', 'color', 'blue'));
    expect(out).toBe('G { Web > API\n  API [color: blue] }');
    expect(parseDiagram(out).nodes.get('API')?.parent).toBe('G');
  });

  it('works on quoted names and names with spaces or hyphens', () => {
    expect(setNodeProperty('"API: v2" [icon: x]', 'API: v2', 'color', 'red').source).toBe('"API: v2" [icon: x, color: red]');
    expect(setNodeProperty('Main Server\nweb-01', 'web-01', 'color', 'red').source).toBe('Main Server\nweb-01 [color: red]');
  });

  it('refuses names defined twice, broken lines, unknown ids and bad input', () => {
    expect(setNodeProperty('A [color: red]\nA [icon: x]', 'A', 'color', 'blue')).toMatchObject({ changed: false, reason: "'A' is defined in 2 places" });
    expect(setNodeProperty('A [color: red] ]', 'A', 'color', 'blue').reason).toMatch(/no 'A'/); // the whole line is skipped
    expect(setNodeProperty('A [color: red] }', 'A', 'color', 'blue').reason).toBe('Line 1 has an error');
    expect(setNodeProperty('A [color: red], x', 'B', 'color', 'blue').reason).toMatch(/no 'B'/);
    expect(setNodeProperty('A {\n  B\n', 'A', 'color', 'blue').reason).toBe('Line 1 has an error');
    expect(setNodeProperty('A', 'A', 'bad key', 'x').reason).toMatch(/property name/);
    expect(setNodeProperty('A', 'A', 'label', 'say "hi"').reason).toMatch(/double quotes/);
  });

  it('accepts the new style properties', () => {
    let src = 'API [icon: server]';
    for (const [k, v] of [['textSize', 'large'], ['textAlign', 'left'], ['textColor', 'red'], ['iconSize', '72'], ['border', 'dotted'], ['strokeWidth', 'thick']] as const) {
      src = edited(src, setNodeProperty(src, 'API', k, v));
    }
    expect(parseDiagram(src).nodes.get('API')?.properties).toEqual({ icon: 'server', textSize: 'large', textAlign: 'left', textColor: 'red', iconSize: '72', border: 'dotted', strokeWidth: 'thick' });
  });
});

describe('renameNode', () => {
  it('renames the declaration and every reference', () => {
    const src = 'API [icon: server]\nWeb > API: calls\nAPI, Web > DB\nAPIs > API';
    const out = edited(src, renameNode(src, 'API', 'Gateway'));
    expect(out).toBe('Gateway [icon: server]\nWeb > Gateway: calls\nGateway, Web > DB\nAPIs > Gateway');
  });

  it('does not touch names that merely contain the old one, or labels', () => {
    const src = 'API\nAPI server > API: API call';
    expect(renameNode(src, 'API', 'Gw').source).toBe('Gw\nAPI server > Gw: API call');
  });

  it('handles quoted names, spaces and hyphens', () => {
    expect(renameNode('"a: b" > web-01', 'a: b', 'Edge').source).toBe('"Edge" > web-01');
    expect(renameNode('"a: b" > web-01', 'web-01', 'web 02').source).toBe('"a: b" > web 02');
    expect(renameNode('A > B', 'B', 'C, D').source).toBe('A > "C, D"');
    expect(renameNode('A > B', 'B', 'x - y').source).toBe('A > "x - y"');
    expect(renameNode('A', 'A', 'title page').source).toBe('"title page"');
    const out = edited('A > B', renameNode('A > B', 'B', 'C, D'));
    expect(parseDiagram(out).nodes.has('C, D')).toBe(true);
  });

  it('renames groups, flow steps and attached events', () => {
    const src = 'Pool {\n  Task [type: activity]\n  Timeout [type: event, attached: Task]\n}\nflow Main {\n  Task > Timeout: waits\n}';
    const out = edited(src, renameNode(src, 'Task', 'Review'));
    expect(out).toBe('Pool {\n  Review [type: activity]\n  Timeout [type: event, attached: Review]\n}\nflow Main {\n  Review > Timeout: waits\n}');
    expect(renameNode(src, 'Pool', 'Lane').source.startsWith('Lane {')).toBe(true);
  });

  it('refuses blank, existing and quoted names', () => {
    expect(renameNode('A > B', 'A', ' ').reason).toMatch(/blank/);
    expect(renameNode('A > B', 'A', 'B').reason).toMatch(/already exists/);
    expect(renameNode('A > B', 'A', 'x"y').reason).toMatch(/double quotes/);
    expect(renameNode('A > B', 'Z', 'Y').reason).toMatch(/no 'Z'/);
    expect(renameNode('A > B', 'A', 'A')).toEqual({ source: 'A > B', changed: false });
  });
});

describe('declareNode', () => {
  it('adds a declaration with properties after the first use', () => {
    const src = 'direction down\nG {\n    X > Y\n    Y > Z\n}';
    const out = edited(src, declareNode(src, 'Y', { icon: 'db', label: 'a, b' }));
    expect(out).toBe('direction down\nG {\n    X > Y\n    Y [icon: db, label: "a, b"]\n    Y > Z\n}');
  });

  it('uses the group indentation after an opening brace', () => {
    const src = 'G { X > Y\n}';
    expect(edited(src, declareNode(src, 'Y'))).toBe('G { X > Y\n  Y\n}');
  });

  it('keeps the quotes of a quoted name and refuses declared nodes', () => {
    expect(declareNode('A > "b: c"', 'b: c').source).toBe('A > "b: c"\n"b: c"');
    expect(declareNode('A\nA > B', 'A').reason).toMatch(/already declared/);
  });
});

describe('deleteNode', () => {
  it('removes the declaration and every connection to it', () => {
    const src = 'Web\nAPI [icon: server]\nDB\n\nWeb > API: calls\nAPI > DB\nWeb > DB';
    expect(edited(src, deleteNode(src, 'API'))).toBe('Web\nDB\n\nWeb > DB');
  });

  it('drops just that target from multi-target and chain lines', () => {
    const src = 'Web > API, Auth, DB';
    expect(deleteNode(src, 'Auth').source).toBe('Web > API, DB');
    const chain = 'A > B > C > D';
    expect(deleteNode('A\nB\nC\nD\n' + chain, 'C').source).toBe('A\nB\nD\nA > B');
    expect(edgesOf(deleteNode('A > B > C', 'B').source)).toEqual([]);
  });

  it('keeps undeclared neighbours alive in their group', () => {
    const src = 'G {\n  Web > API // first\n}';
    const out = edited(src, deleteNode(src, 'API'));
    expect(out).toBe('G {\n  Web // first\n}');
    expect(parseDiagram(out).nodes.get('Web')?.parent).toBe('G');
  });

  it('removes one name from a shared declaration', () => {
    expect(deleteNode('A, B, C [color: red]', 'B').source).toBe('A, C [color: red]');
  });

  it('deletes a group with its contents and the connections into it', () => {
    const src = 'Cloud {\n  A\n  Inner {\n    B\n  }\n}\nC\nC > A\nC > B, C2\n// tail';
    const out = edited(src, deleteNode(src, 'Cloud'));
    expect(out).toBe('C\nC > C2\n// tail');
    expect(deleteNode('G { A, B }\nC', 'G').source).toBe('C');
  });

  it('keeps the contents of a group when asked', () => {
    const src = 'Outer {\n  Cloud [color: blue] {\n    A\n\n    // note\n    B > A\n  }\n  C > Cloud\n}';
    const out = edited(src, deleteNode(src, 'Cloud', { keepContents: true }));
    // C was only used in the deleted connection, so it keeps a declaration.
    expect(out).toBe('Outer {\n  A\n\n  // note\n  B > A\n  C\n}');
    expect(parseDiagram(out).nodes.get('A')?.parent).toBe('Outer');
    expect(deleteNode('G { A, B }\nC', 'G', { keepContents: true }).source).toBe('A, B\nC');
  });

  it('removes flow steps through the node', () => {
    const src = 'A > B > C\nflow F {\n  A > B: one\n  B > C: two\n}';
    const out = edited(src, deleteNode(src, 'C'));
    expect(out).toBe('A > B\nflow F {\n  A > B: one\n}');
  });

  it('refuses unclosed groups and unknown ids', () => {
    expect(deleteNode('G {\n  A', 'G').reason).toMatch(/closing/);
    expect(deleteNode('A', 'B').reason).toMatch(/no 'B'/);
  });
});

describe('edge edits', () => {
  it('sets, replaces and removes connection properties', () => {
    const src = 'Web > API: calls';
    const out = edited(src, setEdgeProperty(src, 'e0', 'color', 'red'));
    expect(out).toBe('Web > API: calls [color: red]');
    expect(setEdgeProperty('Web > API', 'e0', 'line', 'dotted').source).toBe('Web > API [line: dotted]');
    expect(edited(out, setEdgeProperty(out, 'e0', 'color', null))).toBe(src);
    let s = 'Web > API';
    for (const [k, v] of [['line', 'dotted'], ['strokeWidth', 'thick'], ['startArrow', 'dot'], ['endArrow', 'open'], ['labelSize', 'small'], ['routing', 'straight']] as const) {
      s = edited(s, setEdgeProperty(s, 'e0', k, v));
    }
    expect(s).toBe('Web > API [line: dotted, strokeWidth: thick, startArrow: dot, endArrow: open, labelSize: small, routing: straight]');
  });

  it('splits a multi-target line to restyle one arrow', () => {
    const src = '  Web > API, Auth: login // auth';
    const out = edited(src, setEdgeProperty(src, 'e0', 'color', 'red'));
    expect(out).toBe('  Web > API: login [color: red]\n  Web > Auth: login // auth');
    expect(edgesOf(out)).toEqual(['Web>API:login{"color":"red"}', 'Web>Auth:login']);
  });

  it('splits a chain, keeping every edge id', () => {
    const src = 'A > B > C [color: blue]\nX > Y';
    const out = edited(src, setEdgeProperty(src, 'e1', 'color', 'red'));
    expect(out).toBe('A > B [color: blue]\nB > C [color: red]\nX > Y');
    expect(edgesOf(out)).toEqual(['A>B{"color":"blue"}', 'B>C{"color":"red"}', 'X>Y']);
  });

  it('keeps edge order when splitting fan-in and fan-out', () => {
    const src = 'A, B > C, D, E';
    const before = edgesOf(src);
    const out = edited(src, setEdgeProperty(src, 'e4', 'color', 'red')); // B > D
    expect(out).toBe('A > C, D, E\nB > C\nB > D [color: red]\nB > E');
    expect(edgesOf(out).map((e) => e.replace(/\{.*/, ''))).toEqual(before);
  });

  it('splits inside a one-line group', () => {
    const src = 'G { A > B, C }';
    const out = edited(src, setEdgeProperty(src, 'e1', 'color', 'red'));
    expect(out).toBe('G { A > B\n  A > C [color: red] }');
    expect(parseDiagram(out).nodes.get('G')?.children).toEqual(['A', 'B', 'C']);
  });

  it('sets, changes and removes labels', () => {
    expect(setEdgeLabel('Web > API', 'e0', 'calls').source).toBe('Web > API: calls');
    expect(setEdgeLabel('Web > API [color: red]', 'e0', 'calls').source).toBe('Web > API: calls [color: red]');
    expect(setEdgeLabel('Web > API: calls [color: red]', 'e0', 'reads').source).toBe('Web > API: reads [color: red]');
    expect(setEdgeLabel('Web > API: calls [color: red]', 'e0', null).source).toBe('Web > API [color: red]');
    expect(setEdgeLabel('Web > API: calls', 'e0', '  ').source).toBe('Web > API');
    expect(setEdgeLabel('Web > API: calls // x', 'e0', 'a > b').source).toBe('Web > API: a > b // x');
    const out = edited('Web > API, DB', setEdgeLabel('Web > API, DB', 'e1', 'stores'));
    expect(out).toBe('Web > API\nWeb > DB: stores');
  });

  it('refuses labels the parser would misread', () => {
    expect(setEdgeLabel('A > B', 'e0', 'x // y').reason).toMatch(/comment/);
    expect(setEdgeLabel('A > B', 'e0', 'items[0]').reason).toMatch(/\]/);
    expect(setEdgeLabel('G { A > B }', 'e0', 'x').reason).toMatch(/own line/);
    expect(setEdgeLabel('A > B', 'e9', 'x').reason).toMatch(/no connection/);
  });

  it('changes connectors, spacing them', () => {
    expect(edited('Web > API', setEdgeConnector('Web > API', 'e0', '-->'))).toBe('Web --> API');
    expect(setEdgeConnector('Web>API: x', 'e0', '--').source).toBe('Web -- API: x');
    expect(parseDiagram(setEdgeConnector('a-b>c', 'e0', '-').source).edges[0]).toMatchObject({ from: 'a-b', to: 'c', connector: '-' });
    expect(setEdgeConnector('Web > API, DB', 'e0', '-->').source).toBe('Web --> API\nWeb > DB');
    expect(setEdgeConnector('A > B', 'e0', '>')).toEqual({ source: 'A > B', changed: false });
    expect(setEdgeConnector('A > B', 'e0', '~>' as never).reason).toMatch(/connector/);
  });

  it('reverses an edge, keeping label and properties', () => {
    expect(edited('Web > API: calls [color: red]', reverseEdge('Web > API: calls [color: red]', 'e0'))).toBe('API > Web: calls [color: red]');
    expect(reverseEdge('"a b" > c', 'e0').source).toBe('c > "a b"');
    expect(reverseEdge('A > B > C', 'e1').source).toBe('A > B\nC > B');
  });

  it('deletes an edge, keeping the boxes', () => {
    const src = 'Web > API\nAPI > DB';
    const out = edited(src, deleteEdge(src, 'e0'));
    expect(out).toBe('Web\nAPI > DB');
    expect([...parseDiagram(out).nodes.keys()].sort()).toEqual(['API', 'DB', 'Web']);
    expect(deleteEdge('A\nB\nA > B // gone\nC', 'e0').source).toBe('A\nB\nC');
    // Auth was only used here, so it stays as a declaration.
    expect(deleteEdge('Web > API, Auth, DB', 'e1').source).toBe('Auth\nWeb > API, DB');
    expect(deleteEdge('Web > API, Auth, DB\nAuth > DB', 'e1').source).toBe('Web > API, DB\nAuth > DB');
    expect(deleteEdge('A, B, C > D', 'e1').source).toBe('B\nA, C > D');
    expect(deleteEdge('A > B > C', 'e0').source).toBe('A\nB > C');
  });

  it('refuses lines with errors', () => {
    expect(setEdgeProperty('A > B ]', 'e0', 'color', 'red').reason).toMatch(/no connection/);
    expect(setEdgeProperty('A > B\n}', 'e0', 'color', 'red').changed).toBe(true);
  });
});

describe('applyEdits', () => {
  it('applies edits in order as one change', () => {
    const src = 'Web > API, Auth';
    const out = applyEdits(src, [
      { type: 'setEdgeProperty', edgeId: 'e0', key: 'color', value: 'red' },
      { type: 'setEdgeProperty', edgeId: 'e1', key: 'color', value: 'red' },
      { type: 'setNodeProperty', nodeId: 'Web', key: 'icon', value: 'user' },
      { type: 'renameNode', nodeId: 'Auth', name: 'Login' },
    ]);
    expect(edited(src, out)).toBe('Web > API [color: red]\nWeb [icon: user]\nWeb > Login [color: red]');
  });

  it('applies nothing when one edit is refused', () => {
    expect(applyEdits('A > B', [{ type: 'setNodeProperty', nodeId: 'A', key: 'color', value: 'red' }, { type: 'deleteEdge', edgeId: 'e7' }])).toMatchObject({
      source: 'A > B',
      changed: false,
      reason: expect.stringMatching(/e7/),
    });
  });

  it('keeps CRLF line endings', () => {
    expect(setNodeProperty('A\r\nB > A\r\n', 'B', 'color', 'red').source).toBe('A\r\nB > A\r\nB [color: red]\r\n');
  });
});

describe('corpus round trip', () => {
  const dir = new URL('../corpus/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.eraser')).sort();

  it.each(files)('%s', (file) => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    const diagram = parseDiagram(source);
    const counts = (s: string) => {
      const d = parseDiagram(s);
      return { nodes: d.nodes.size, edges: d.edges.length };
    };
    const base = counts(source);
    const nodes = [...diagram.nodes.keys()].slice(0, 3);
    const edges = diagram.edges.slice(0, 3).map((e) => e.id);
    for (const id of nodes) {
      for (const [key, value] of [['color', 'teal'], ['icon', 'zz-test-icon']]) {
        if (diagram.nodes.get(id)!.properties[key!] === value) continue;
        const out = edited(source, setNodeProperty(source, id, key!, value!));
        expect(parseDiagram(out).nodes.get(id)?.properties[key!]).toBe(value);
        expect(counts(out)).toEqual(base);
      }
      const renamed = edited(source, renameNode(source, id, `${id} renamed`));
      expect(parseDiagram(renamed).nodes.has(`${id} renamed`)).toBe(true);
      expect(counts(renamed)).toEqual(base);
    }
    for (const id of edges) {
      const out = edited(source, setEdgeProperty(source, id, 'color', 'red'));
      expect(parseDiagram(out).edges.find((e) => e.id === id)?.properties.color).toBe('red');
      expect(counts(out)).toEqual(base);
      const labelled = setEdgeLabel(source, id, 'via test');
      if (!labelled.reason) {
        const text = edited(source, labelled);
        expect(parseDiagram(text).edges.find((e) => e.id === id)?.label).toBe('via test');
        expect(counts(text)).toEqual(base);
      }
      const edge = diagram.edges.find((e) => e.id === id)!;
      const reversed = edited(source, reverseEdge(source, id));
      expect(parseDiagram(reversed).edges.find((e) => e.id === id)).toMatchObject({ from: edge.to, to: edge.from });
      expect(counts(reversed)).toEqual(base);
    }
  });
});
