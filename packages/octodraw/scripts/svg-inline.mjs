// Shared by the icon bundlers: turns an SVG file into [viewBox, root attrs, body]
// for inline rendering. Scripts, event handlers, external references and
// <title>s are removed; returns undefined for unparseable files.
const ROOT_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule'];

export function inlineSvg(svg) {
  const root = /<svg\b([^>]*)>([\s\S]*)<\/svg>/i.exec(svg);
  if (!root) return undefined;
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(root[1])?.[1];
  const width = attr('width');
  const height = attr('height');
  const viewBox = attr('viewBox') ?? (width && height ? `0 0 ${parseFloat(width)} ${parseFloat(height)}` : '0 0 24 24');
  const attrs = Object.fromEntries(ROOT_ATTRS.map((a) => [a, attr(a)]).filter(([, v]) => v !== undefined));
  const body = root[2]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*"(?!#)[^"]*"/gi, '')
    .replace(/>\s+</g, '><')
    .trim();
  return [viewBox, attrs, body];
}
