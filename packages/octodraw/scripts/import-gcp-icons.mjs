// Imports the official Google Cloud icon packs (https://cloud.google.com/icons:
// "core products" Unique Icons and Category Icons) into
// icons/vendor/gcp/<eraser-name>.svg, using Eraser's icon names.
//
//   node scripts/import-gcp-icons.mjs <extracted-dir>
//
// Then run `pnpm icons:vendor` to bundle them.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node scripts/import-gcp-icons.mjs <extracted-dir>');
  process.exit(1);
}
const names = new Set(JSON.parse(readFileSync(new URL('./eraser-icon-names.json', import.meta.url), 'utf8'))['Google Cloud']);
const out = new URL('../icons/vendor/gcp/', import.meta.url);

// Folder names whose Eraser name isn't the obvious one.
const ALIASES = {
  gke: ['gcp-google-kubernetes-engine', 'gcp-gke'],
  'vertex-ai': ['gcp-vertexai', 'gcp-vertex-ai'],
  apigee: ['gcp-apigee-api-platform'],
  anthos: ['gcp-anthos'],
  'security-identity': ['gcp-security-and-identity'],
  'ai-machine-learning': ['gcp-ai-machine-learning'],
  agents: ['gcp-ai-applications-and-agents'],
};

const norm = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

const mapping = {};
const unmatched = [];
for (const file of walk(pack).filter((p) => p.endsWith('.svg'))) {
  // .../<Product or Category>/SVG/<file>.svg
  const folder = basename(dirname(dirname(file)));
  const key = norm(folder);
  const candidates = [...(ALIASES[key] ?? []), `gcp-${key}`, `gcp-${key.replace(/-and-/g, '-')}`, `gcp-cloud-${key}`];
  const name = candidates.find((c) => names.has(c));
  if (name) mapping[name] = file;
  else unmatched.push(folder);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, file] of Object.entries(mapping)) copyFileSync(file, new URL(`${name}.svg`, out));
writeFileSync(
  new URL('SOURCE.md', out),
  `# Google Cloud icons

Official icons from https://cloud.google.com/icons (core product "Unique Icons" and "Category Icons"),
used under Google's terms. Files are renamed to Eraser's icon names.
Imported by scripts/import-gcp-icons.mjs.

Mapped ${Object.keys(mapping).length}. Folders with no Eraser name: ${unmatched.join(', ') || 'none'}.
`,
);
console.log(`gcp: mapped ${Object.keys(mapping).length}; unmatched folders: ${unmatched.join(', ') || 'none'}`);
