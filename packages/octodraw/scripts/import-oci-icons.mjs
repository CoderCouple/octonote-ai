// Imports Oracle Cloud Infrastructure icons into icons/vendor/oci/. The OCI
// Architecture Diagram Toolkit ships its icons as a draw.io library
// ("OCI Library.xml"); export each entry to SVG first (see
// scripts/README-vendor-icons.md), then:
//
//   node scripts/import-oci-icons.mjs <dir-of-exported-svgs>
//
// Eraser's oci-* names are mapped by title; every other OCI icon is kept as
// oci-<title>. Baked-in draw.io labels are stripped (octodraw draws its own).
// Then run `pnpm icons:vendor` to bundle them.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/import-oci-icons.mjs <dir-of-exported-svgs>');
  process.exit(1);
}
const eraserNames = JSON.parse(readFileSync(new URL('./eraser-icon-names.json', import.meta.url), 'utf8'))['Oracle Cloud'];
const out = new URL('../icons/vendor/oci/', import.meta.url);

// Library titles look like "<category>-<service>"; drop the category for names.
const CATEGORY = /^(analytics-and-ai|applications|compute|database|developer-services|governance-and-administration|identity-and-security|logical-components?|migration|networking|observability-and-management|storage|hybrid|digital-media|marketplace|connector)-/;
const STOP = new Set(['oci', 'oracle', 'and', 'the', 'of', 'for', 'cloud', 'service', 'services']);
const tokens = (s) => s.split('-').filter((t) => t && !STOP.has(t));

const stripLabels = (svg) =>
  svg
    .replace(/<switch>[\s\S]*?<\/switch>/g, '')
    .replace(/<text\b[\s\S]*?<\/text>/g, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '');

const files = readdirSync(dir).filter((f) => f.endsWith('.svg') && !f.startsWith('untitled-'));
const icons = files.map((f) => {
  const title = f.slice(0, -4);
  const short = title.replace(CATEGORY, '');
  return { file: join(dir, f), title, short, tokens: new Set(tokens(short)) };
});

// Eraser names whose OCI title differs.
const ALIASES = { 'autonomous-database': 'database-autonomous-db', backup: 'storage-back-up-restore', 'private-subnet': 'physical-grouping-subnet' };

const mapping = new Map();
const missing = [];
for (const name of eraserNames) {
  const want = tokens(name.slice(4));
  // Alias or exact short title, else the icon containing all the name's words with the fewest extras.
  const exact = icons.find((i) => i.title === ALIASES[name.slice(4)]) ?? icons.find((i) => i.short === name.slice(4));
  const best = exact ?? icons.filter((i) => want.every((t) => i.tokens.has(t))).sort((a, b) => a.tokens.size - b.tokens.size)[0];
  if (best) mapping.set(name, best);
  else missing.push(name);
}
const used = new Set([...mapping.values()].map((i) => i.title));
for (const icon of icons) {
  const name = `oci-${icon.short}`;
  if (!used.has(icon.title) && !mapping.has(name)) mapping.set(name, icon);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, icon] of mapping) writeFileSync(new URL(`${name}.svg`, out), stripLabels(readFileSync(icon.file, 'utf8')));
writeFileSync(
  new URL('SOURCE.md', out),
  `# Oracle Cloud Infrastructure icons

Official icons from the OCI Architecture Diagram Toolkit (draw.io library), used under Oracle's terms.
Exported to SVG with the diagrams.net viewer; draw.io labels stripped. Eraser's oci-* names are
mapped by title, other icons kept as oci-<title>. Imported by scripts/import-oci-icons.mjs.

Eraser names mapped: ${eraserNames.length - missing.length}/${eraserNames.length}${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. Total icons: ${mapping.size}.
`,
);
console.log(`oci: eraser names ${eraserNames.length - missing.length}/${eraserNames.length}, total ${mapping.size}; missing: ${missing.join(', ') || 'none'}`);
