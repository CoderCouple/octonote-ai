import { groupTitle, type DiagramLayout, type LayoutNode } from '../layout/layout';

// Exports a laid-out diagram in Eraser's element model (Shape / Icon / Group /
// Relationship / Textbox), as JSON — the format importEraserJson reads — or as
// Eraser's XML flavour of the same model, so diagrams round-trip with Eraser.

interface EraserJsonOptions {
  title?: string;
}

type Element = Record<string, unknown> & { tag: string; id: string };

export function exportEraserJson(layout: DiagramLayout, options: EraserJsonOptions = {}): string {
  return JSON.stringify({ title: options.title, elements: toElements(layout, options) }, null, 2);
}

/**
 * Eraser's XML: elements nest inside their groups, texts and group titles are
 * child elements, and points / label placement are JSON-valued attributes.
 */
export function exportEraserXml(layout: DiagramLayout, options: EraserJsonOptions = {}): string {
  const elements = toElements(layout, options);
  const children = new Map<string | undefined, Element[]>();
  for (const e of elements) {
    const parent = e.tag === 'Relationship' ? undefined : (e.containerId as string | undefined);
    children.set(parent, [...(children.get(parent) ?? []), e]);
  }
  const attrs = (e: Element, skip: string[]) =>
    Object.entries(e)
      .filter(([k, v]) => !['tag', 'containerId', ...skip].includes(k) && v !== undefined)
      .map(([k, v]) => ` ${k}="${xmlEscape(typeof v === 'object' ? JSON.stringify(v) : String(v))}"`)
      .join('');
  const texts = (e: Element, indent: string) =>
    ((e.texts as { text: string; fontSize: number; color?: string }[] | undefined) ?? [])
      .map((t) => `${indent}<Text fontSize="${t.fontSize}"${t.color ? ` color="${t.color}"` : ''}>${xmlEscape(t.text)}</Text>`)
      .join('\n');
  const render = (e: Element, indent: string): string => {
    const inner = indent + '  ';
    if (e.tag === 'Group') {
      const title = e.title as { text: string; icon?: string };
      const kids = (children.get(e.id) ?? []).map((c) => render(c, inner));
      return [`${indent}<Group${attrs(e, ['title'])}>`, `${inner}<Title${title.icon ? ` icon="${xmlEscape(title.icon)}"` : ''}>${xmlEscape(title.text)}</Title>`, ...kids, `${indent}</Group>`].join('\n');
    }
    if (e.tag === 'Shape' || e.tag === 'Icon') {
      // Shapes carry their icon as a child; Icon elements keep it as an attribute.
      const icon = e.tag === 'Shape' && e.icon ? `${inner}<Icon icon="${xmlEscape(String(e.icon))}" />\n` : '';
      return `${indent}<${e.tag}${attrs(e, ['texts', ...(e.tag === 'Shape' ? ['icon'] : [])])}>\n${icon}${texts(e, inner)}\n${indent}</${e.tag}>`;
    }
    return `${indent}<${e.tag}${attrs(e, [])} />`;
  };
  const top = (children.get(undefined) ?? []).map((e) => render(e, '  '));
  return [`<Diagram${options.title ? ` title="${xmlEscape(options.title)}"` : ''}>`, ...top, '</Diagram>'].join('\n');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toElements(layout: DiagramLayout, { title }: EraserJsonOptions): Element[] {
  const elements: Element[] = [];
  if (title) elements.push({ tag: 'Textbox', id: 'title', text: `## ${title}`, fontSize: 18, x: 15, y: 15, width: title.length * 10, height: 28 });

  for (const node of layout.nodes) {
    const base = { id: node.id, x: round(node.x), y: round(node.y), width: round(node.width), height: round(node.height), ...(node.parent ? { containerId: node.parent } : {}) };
    if (node.kind === 'group') {
      // Our group titles already carry "label · description".
      elements.push({ tag: 'Group', ...base, title: { text: node.lines[0] ?? groupTitle(node.id, undefined), ...(node.properties.icon ? { icon: node.properties.icon } : {}) }, ...colorOf(node) });
      continue;
    }
    const texts = [...node.lines.map((text) => ({ text, fontSize: 14 })), ...node.description.map((text) => ({ text, fontSize: 12, color: 'gray' }))];
    elements.push({
      tag: node.variant === 'icon' ? 'Icon' : 'Shape',
      ...base,
      texts: mergeLines(texts),
      ...(node.properties.icon ? { icon: node.properties.icon } : {}),
      ...(node.properties.shape ? { shape: node.properties.shape } : {}),
      ...colorOf(node),
    });
  }

  for (const edge of layout.edges) {
    const [first, ...rest] = edge.points;
    if (!first) continue;
    elements.push({
      tag: 'Relationship',
      id: edge.id,
      from: edge.from,
      to: edge.to,
      x: round(first.x),
      y: round(first.y),
      points: [[0, 0], ...rest.map((p) => [round(p.x - first.x), round(p.y - first.y)])],
      endArrowhead: edge.endArrow ? 'triangle' : 'none',
      ...(edge.startArrow ? { startArrowhead: edge.endArrow ? 'arrow' : 'triangle' } : {}),
      lineStyle: edge.dashed ? 'dashed' : 'solid',
      color: edge.color ?? '#1c1c1c',
      lineWidth: 0.75,
      ...(edge.label
        ? { label: edge.label.text, labelPlacement: { x: round(edge.label.x - first.x), y: round(edge.label.y - first.y), width: round(edge.label.width), height: round(edge.label.height) } }
        : {}),
    });
  }
  return elements;
}

function colorOf(node: LayoutNode): Record<string, string> {
  return {
    ...(node.properties.color ? { color: node.properties.color } : {}),
    ...(node.style?.fill ? { bgColor: node.style.fill } : {}),
    ...(node.style?.stroke ? { borderColor: node.style.stroke } : {}),
  };
}

/** Wrapped label lines are one text in Eraser's format. */
function mergeLines(texts: { text: string; fontSize: number; color?: string }[]) {
  const merged: typeof texts = [];
  for (const t of texts) {
    const prev = merged.at(-1);
    if (prev && prev.fontSize === t.fontSize && prev.color === t.color) prev.text += ` ${t.text}`;
    else merged.push({ ...t });
  }
  return merged;
}

const round = (n: number) => Math.round(n * 100) / 100;
