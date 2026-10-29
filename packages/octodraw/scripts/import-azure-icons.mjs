// Imports the official Azure architecture icons
// (https://learn.microsoft.com/azure/architecture/icons/, used under the
// Microsoft Terms of Use included in the pack) into
// icons/vendor/azure/<eraser-name>.svg, using Eraser's icon names.
//
//   node scripts/import-azure-icons.mjs <extracted-pack-dir>
//
// Then run `pnpm icons:vendor` to bundle them.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node scripts/import-azure-icons.mjs <extracted-pack-dir>');
  process.exit(1);
}
const names = JSON.parse(readFileSync(new URL('./eraser-icon-names.json', import.meta.url), 'utf8')).Azure.filter((n) => n.startsWith('azure-'));
const out = new URL('../icons/vendor/azure/', import.meta.url);

const norm = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Singular forms so "Storage-Accounts" matches "storage-account".
const singular = (t) => (t.length > 4 && t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

// Eraser names for services Microsoft has since renamed (Azure AD → Entra, …).
const ALIASES = {
  'aad-licenses': 'entra-identity-licenses',
  'ad-domain-services': 'entra-domain-services',
  'ad-identity-protection': 'entra-id-protection',
  'ad-privilege-identity-management': 'entra-privleged-identity-management',
  pim: 'entra-privleged-identity-management',
  'ad-roles-and-administrators': 'entra-identity-roles-and-administrators',
  'custom-azure-ad-roles': 'entra-identity-custom-roles',
  'security-center': 'microsoft-defender-for-cloud',
  'spring-cloud': 'azure-spring-apps',
  'windows-virtual-desktop': 'azure-virtual-desktop',
  'data-box-edge': 'data-box',
  'stack-edge': 'data-box',
  'private-link-hub': 'private-link',
  'private-mobile-network': 'mobile-networks',
  'reserved-capacity-groups': 'capacity-reservation-groups',
  'virtual-enclaves': 'azure-enclaves',
  'vm-application-definition': 'vm-app-definitions',
  'vm-application-version': 'vm-app-versions',
  'web-application-firewall-policieswaf': 'web-application-firewall-policies-waf',
  'infrastructure-backup': 'azure-backup-center',
  'hpc-workbench': 'azure-hpc-workbenches',
  'acs-solutions-builder': 'solutions',
};
const STOP = new Set(['azure', 'microsoft', 'and', 'for', 'the', 'of', 'service', 'services']);
const tokens = (s) => s.split('-').map(singular).filter((t) => t && !STOP.has(t));
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

// "10086-icon-service-Storage-Accounts.svg" → "storage-accounts"
const files = walk(pack)
  .filter((p) => p.endsWith('.svg'))
  .map((p) => {
    const key = norm(basename(p, '.svg').replace(/^\d+-icon-service-/, ''));
    return { file: p, key, bare: key.replace(/^(azure|microsoft)-/, ''), tokens: new Set(tokens(key)) };
  });
const byKey = new Map();
for (const f of files) for (const k of [f.key, f.bare, tokens(f.key).join('-')]) if (!byKey.has(k)) byKey.set(k, f);

const mapping = {};
const missing = [];
for (const name of names) {
  const service = name.slice(6);
  let match = [ALIASES[service], service, `azure-${service}`, `microsoft-${service}`, tokens(service).join('-')].filter(Boolean).map((k) => byKey.get(k)).find(Boolean);
  if (!match) {
    // All of the name's words appear in a file name, with at most two extras.
    const want = tokens(service);
    if (want.length) {
      match = files
        .filter((f) => want.every((t) => f.tokens.has(t)) && f.tokens.size - want.length <= 2)
        .sort((a, b) => a.tokens.size - b.tokens.size)[0];
    }
  }
  if (match) mapping[name] = match.file;
  else missing.push(name);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, file] of Object.entries(mapping)) copyFileSync(file, new URL(`${name}.svg`, out));
writeFileSync(
  new URL('SOURCE.md', out),
  `# Azure architecture icons

Official icons from https://learn.microsoft.com/azure/architecture/icons/ (${basename(pack)}),
used under the Microsoft Terms of Use shipped in the pack: permitted in architectural diagrams,
training materials and documentation; don't crop, flip, rotate or reshape them.
Files are renamed to Eraser's icon names. Imported by scripts/import-azure-icons.mjs.

Mapped ${Object.keys(mapping).length} of ${names.length} azure-* names. Not found in this pack:
${missing.map((n) => `- ${n}`).join('\n')}
`,
);
console.log(`azure: mapped ${Object.keys(mapping).length}/${names.length}; missing ${missing.length}`);
