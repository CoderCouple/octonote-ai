import { describe, expect, it } from 'vitest';
import { buildView, exportEraserJson, exportEraserXml, importEraserJson, layoutView, lightTheme, lineBetween, parseDiagram, renderCanvasSvg, renderDiagramSvg, type ArrowHead, type CanvasItem, type LineItem, type ShapeItem } from '../src';

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

describe('canvas export styling', () => {
  const render = (items: CanvasItem[]) => renderCanvasSvg({ version: 1, items }, { theme: lightTheme, padding: 0 }).svg;
  const rect = (extra: Partial<ShapeItem>): ShapeItem => ({ id: 's', type: 'shape', shape: 'rectangle', x: 0, y: 0, w: 200, h: 100, text: 'Hi', ...extra });

  it('draws dotted and dashed outlines scaled to the width', () => {
    // Shapes draw 1.25 by default: dotted = round caps, 0.5·w on, 4.5·w off.
    const dotted = render([rect({ strokeStyle: 'dotted' })]);
    expect(dotted).toContain('stroke-dasharray="0.63 5.63" stroke-linecap="round"');
    // strokeWidth 4 = 4/1.5 of the default; dashes grow with it.
    const thick = render([rect({ strokeStyle: 'dashed', strokeWidth: 4 })]);
    expect(thick).toContain('stroke-width="3.3333333333333335"');
    expect(thick).toContain('stroke-dasharray="16 13.33"');
  });

  it('applies opacity per item', () => {
    expect(render([rect({ opacity: 0.4 })])).toContain('opacity="0.4"');
  });

  it('uses per-part colours and label styles', () => {
    const svg = render([rect({ strokeColor: '#ff0000', fillColor: 'green', textColor: 'red', fontSize: 22, italic: true, bold: true, font: 'serif' })]);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain(`fill="${lightTheme.palette.green.nodeFill}"`);
    expect(svg).toContain(`fill="${lightTheme.palette.red.ink}"`);
    expect(svg).toContain('font-size="22"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('Georgia');
    const sticky = render([{ id: 'n', type: 'sticky', x: 0, y: 0, w: 100, h: 100, text: 'N', textColor: 'blue', font: 'hand', fontSize: 24 }]);
    expect(sticky).toContain('Patrick Hand');
    expect(sticky).toContain(`fill="${lightTheme.palette.blue.ink}"`);
    expect(sticky).toContain('font-size="24"');
    const text = render([{ id: 't', type: 'text', x: 0, y: 0, w: 50, h: 20, text: 'T', fontSize: 20, font: 'mono' }]);
    expect(text).toContain('JetBrains Mono');
  });

  it('draws every arrowhead kind, elbow paths and line widths', () => {
    const line = (startHead: ArrowHead, endHead: ArrowHead, extra: Partial<LineItem> = {}): LineItem => ({ ...lineBetween({ x: 0, y: 0 }, { x: 200, y: 100 }, { startHead, endHead, ...extra }), id: `l-${startHead}-${endHead}` });
    const svg = render([line('open', 'dot'), line('diamond', 'arrow', { route: 'elbow', strokeWidth: 4, strokeStyle: 'dotted' }), line('none', 'none')]);
    expect(svg).toContain('<path d="M1.5 1.5L9 5L1.5 8.5" fill="none"');
    expect(svg).toContain('<circle cx="5" cy="5" r="4"');
    expect(svg).toContain('<path d="M0 5L5 0.5L10 5L5 9.5z"');
    expect(svg).toContain('<path d="M0 0L10 5L0 10z"');
    expect(svg).toContain('d="M0 0L100 0L100 100L200 100"');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('stroke-dasharray="2 18"');
    expect(svg).toContain('markerWidth="17.5"');
    // Four heads in all: none on the last line.
    expect(svg.match(/<marker /g)).toHaveLength(4);
    expect(svg).toContain('marker-start="url(#occ-export-arrow-l-open-dot-s)"');
  });

  it('draws pen widths and frame colours', () => {
    const svg = render([
      { id: 'p', type: 'pen', x: 0, y: 0, w: 10, h: 10, points: [[0, 0], [1, 1]], strokeWidth: 4 },
      { id: 'f', type: 'frame', x: 0, y: 40, w: 300, h: 600, device: 'phone', color: 'purple' },
    ]);
    expect(svg).toContain('stroke-width="6"');
    expect(svg).toContain(`stroke="${lightTheme.palette.purple.ink}"`);
  });
});
