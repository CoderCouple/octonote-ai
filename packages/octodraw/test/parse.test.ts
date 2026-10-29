import { describe, expect, it } from 'vitest';
import { parseDiagram } from '../src';

const errors = (source: string) => parseDiagram(source).diagnostics.filter((d) => d.severity === 'error');

describe('nodes and groups', () => {
  it('parses a node with properties', () => {
    const d = parseDiagram('compute [icon: aws-ec2, color: blue]');
    expect(d.diagnostics).toEqual([]);
    expect(d.nodes.get('compute')).toMatchObject({ kind: 'node', label: 'compute', parent: null, properties: { icon: 'aws-ec2', color: 'blue' } });
  });

  it('keeps spaces and hyphens in names', () => {
    const d = parseDiagram('Main Server [icon: aws-ec2]\nweb-01');
    expect([...d.nodes.keys()]).toEqual(['Main Server', 'web-01']);
  });

  it('parses nested groups', () => {
    const d = parseDiagram(`
VPC Subnet {
  Main Server [icon: aws-ec2, color: blue] {
    Server [icon: aws-ec2]
    Data [icon: aws-rds]
  }
}`);
    expect(d.diagnostics).toEqual([]);
    expect(d.roots).toEqual(['VPC Subnet']);
    expect(d.nodes.get('VPC Subnet')).toMatchObject({ kind: 'group', children: ['Main Server'] });
    expect(d.nodes.get('Main Server')).toMatchObject({ kind: 'group', parent: 'VPC Subnet', children: ['Server', 'Data'], properties: { color: 'blue' } });
    expect(d.nodes.get('Data')?.parent).toBe('Main Server');
  });

  it('supports single-line groups', () => {
    const d = parseDiagram('G { A, B }\nC');
    expect(d.diagnostics).toEqual([]);
    expect(d.nodes.get('G')?.children).toEqual(['A', 'B']);
    expect(d.nodes.get('C')?.parent).toBeNull();
  });

  it('uses label for display but name for identity', () => {
    const d = parseDiagram('Server_A [label: server]\nServer_B [label: server]');
    expect(d.nodes.get('Server_A')?.label).toBe('server');
    expect(d.nodes.get('Server_B')?.label).toBe('server');
  });

  it('unescapes quoted values and \\n', () => {
    const d = parseDiagram('web-01 [icon: aws-ec2, label: "web-01\\n10.0.12.34"]');
    expect(d.nodes.get('web-01')?.label).toBe('web-01\n10.0.12.34');
  });
});

describe('connections', () => {
  it.each([
    ['>', false, true, false],
    ['<', true, false, false],
    ['<>', true, true, false],
    ['-', false, false, false],
    ['--', false, false, true],
    ['-->', false, true, true],
  ])('connector %s', (connector, startArrow, endArrow, dashed) => {
    const d = parseDiagram(`Compute ${connector} Storage`);
    expect(d.diagnostics).toEqual([]);
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0]).toMatchObject({ from: 'Compute', to: 'Storage', connector, startArrow, endArrow, dashed });
  });

  it('parses labels and properties', () => {
    const d = parseDiagram('Storage > Server: Cache Hit [color: green]');
    expect(d.edges[0]).toMatchObject({ label: 'Cache Hit', properties: { color: 'green' } });
  });

  it('allows properties without a label', () => {
    const d = parseDiagram('Storage > Server: [color: green]');
    expect(d.edges[0]?.label).toBeUndefined();
    expect(d.edges[0]?.properties).toEqual({ color: 'green' });
  });

  it('keeps connector characters inside labels', () => {
    const d = parseDiagram('A > B: x > y');
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0]?.label).toBe('x > y');
  });

  it('fans out to multiple targets', () => {
    const d = parseDiagram('Server > Worker1, Worker2, Worker3');
    expect(d.edges.map((e) => e.to)).toEqual(['Worker1', 'Worker2', 'Worker3']);
  });

  it('chains connections', () => {
    const d = parseDiagram('A > B --> C');
    expect(d.edges.map((e) => [e.from, e.to, e.connector])).toEqual([
      ['A', 'B', '>'],
      ['B', 'C', '-->'],
    ]);
  });

  it('creates undeclared names as implicit nodes in the enclosing group', () => {
    const d = parseDiagram('G {\n  A\n  A > B\n}\nB > C');
    expect(d.nodes.get('B')).toMatchObject({ implicit: true, parent: 'G' });
    expect(d.nodes.get('C')).toMatchObject({ implicit: true, parent: null });
    expect(d.nodes.get('G')?.children).toEqual(['A', 'B']);
    expect(d.roots).toEqual(['G', 'C']);
  });

  it('resolves names declared after the connection', () => {
    const d = parseDiagram('A > B\nG {\n  B [icon: server]\n}');
    expect(d.nodes.get('B')).toMatchObject({ implicit: false, parent: 'G' });
  });

  it('supports quoted names with reserved characters', () => {
    const d = parseDiagram('User > "https://localhost:8080": GET');
    expect(d.edges[0]).toMatchObject({ from: 'User', to: 'https://localhost:8080', label: 'GET' });
  });

  it('connects groups', () => {
    const d = parseDiagram('G1 { A }\nG2 { B }\nG1 > G2');
    expect(d.diagnostics).toEqual([]);
    expect(d.edges[0]).toMatchObject({ from: 'G1', to: 'G2' });
  });
});

describe('settings, comments and legend', () => {
  it('parses global settings', () => {
    const d = parseDiagram('title My System\ndirection down\ncolorMode bold\nstyleMode plain\ntypeface clean\nwrap off');
    expect(d.diagnostics).toEqual([]);
    expect(d.settings).toEqual({ title: 'My System', direction: 'down', colorMode: 'bold', styleMode: 'plain', typeface: 'clean', wrap: 'off' });
  });

  it('warns on unknown property values', () => {
    const d = parseDiagram('A [shape: blob]\nB [shape: hexagon, typeface: mono]');
    expect(d.diagnostics.map((x) => x.message)).toEqual([expect.stringMatching(/^Unknown shape 'blob'/)]);
  });

  it('ignores comments', () => {
    const d = parseDiagram('// header\nA > B // trailing\n"x//y"');
    expect(d.diagnostics).toEqual([]);
    expect([...d.nodes.keys()]).toEqual(['x//y', 'A', 'B']);
  });

  it('parses a legend', () => {
    const d = parseDiagram(`legend [position: bottom-left] {
  [connection: -->, label: Async]
  [color: red, label: Error]
}
A`);
    expect(d.diagnostics).toEqual([]);
    expect(d.legend?.properties).toEqual({ position: 'bottom-left' });
    expect(d.legend?.items.map((i) => i.properties)).toEqual([
      { connection: '-->', label: 'Async' },
      { color: 'red', label: 'Error' },
    ]);
    expect(d.nodes.has('legend')).toBe(false);
    expect(d.roots).toEqual(['A']);
  });
});

describe('diagnostics', () => {
  it('reports an unclosed group and still returns its children', () => {
    const d = parseDiagram('G {\n  A');
    expect(errors('G {\n  A')).toMatchObject([{ line: 1, message: "Missing closing '}'" }]);
    expect(d.nodes.get('A')?.parent).toBe('G');
  });

  it('reports a stray closing brace', () => {
    expect(errors('A\n}')).toMatchObject([{ line: 2, column: 1 }]);
  });

  it('warns on unknown properties without failing', () => {
    const d = parseDiagram('A [icon: server, sparkle: yes]');
    expect(d.diagnostics).toMatchObject([{ severity: 'warning', line: 1, column: 18, message: "Unknown node property 'sparkle'" }]);
    expect(d.nodes.get('A')?.properties.icon).toBe('server');
  });

  it('reports a dangling connector and keeps parsing later lines', () => {
    const d = parseDiagram('A >\nB > C');
    expect(errors('A >\nB > C')).toMatchObject([{ line: 1, message: 'Expected a name' }]);
    expect(d.edges.map((e) => [e.from, e.to])).toEqual([['B', 'C']]);
  });

  it('reports an invalid direction', () => {
    expect(errors('direction sideways')[0]?.message).toMatch(/Unknown direction/);
  });

  it('reports a missing bracket', () => {
    expect(errors('A [icon: server')[0]).toMatchObject({ line: 1, column: 3, message: "Missing closing ']'" });
  });

  it('warns about duplicate declarations', () => {
    const d = parseDiagram('A [icon: x]\nA [color: red]');
    expect(d.diagnostics[0]).toMatchObject({ severity: 'warning', line: 2 });
    expect(d.nodes.get('A')?.properties).toEqual({ icon: 'x', color: 'red' });
  });
});
