import { describe, expect, it } from 'vitest';
import { buildView, exportEraserJson, exportEraserXml, importEraserJson, layoutView, lightTheme, parseDiagram, renderDiagramSvg } from '../src';

const source = `title Shop
VPC [color: blue] {
  API [icon: server, description: REST]
  DB [shape: cylinder]
}
User [icon: user]
User > API: HTTPS
API --> DB`;

async function laidOut() {
  const diagram = parseDiagram(source);
  const layout = await layoutView(buildView(diagram, { focus: null }), { direction: diagram.settings.direction });
  return { diagram, layout };
}

describe('renderDiagramSvg', () => {
  it('produces a standalone SVG with every label, title and background', async () => {
    const { diagram, layout } = await laidOut();
    const { svg, width, height } = renderDiagramSvg({ layout, settings: diagram.settings, theme: lightTheme, title: 'Shop', iconSet: 'open' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    for (const text of ['Shop', 'API', 'REST', 'DB', 'User', 'HTTPS', 'VPC']) expect(svg).toContain(text);
    expect(svg).toContain(`fill="${lightTheme.color.canvas}"`);
    expect(svg).not.toContain('od-expand');
  });

  it('can be transparent and embed font CSS', async () => {
    const { diagram, layout } = await laidOut();
    const { svg } = renderDiagramSvg({ layout, settings: diagram.settings, theme: lightTheme, background: 'transparent', fontCss: '@font-face{font-family:X}' });
    expect(svg).toContain('<style>@font-face{font-family:X}</style>');
    expect(svg).not.toContain('<rect width="100%"');
  });
});

describe('Eraser JSON / XML export', () => {
  it('round-trips through the importer', async () => {
    const { layout } = await laidOut();
    const imported = importEraserJson(exportEraserJson(layout, { title: 'Shop' }));
    expect(imported.diagnostics).toEqual([]);
    expect(imported.title).toBe('Shop');
    expect(imported.layout.nodes.map((n) => n.id).sort()).toEqual(layout.nodes.map((n) => n.id).sort());
    expect(imported.layout.edges).toHaveLength(layout.edges.length);
    const api = imported.layout.nodes.find((n) => n.id === 'API')!;
    expect(api).toMatchObject({ parent: 'VPC', description: ['REST'], properties: { icon: 'server' } });
    expect(imported.layout.edges.find((e) => e.from === 'User')?.label?.text).toBe('HTTPS');
  });

  it('nests elements inside groups in XML', async () => {
    const { layout } = await laidOut();
    const xml = exportEraserXml(layout, { title: 'Shop' });
    expect(xml.startsWith('<Diagram title="Shop">')).toBe(true);
    const group = xml.slice(xml.indexOf('<Group'), xml.indexOf('</Group>'));
    expect(group).toContain('<Title>VPC</Title>');
    expect(group).toContain('id="API"');
    expect(group).toContain('<Text fontSize="12" color="gray">REST</Text>');
    expect(xml).toMatch(/<Relationship[^>]+points="\[\[0,0\]/);
    expect(xml.trim().endsWith('</Diagram>')).toBe(true);
  });
});
