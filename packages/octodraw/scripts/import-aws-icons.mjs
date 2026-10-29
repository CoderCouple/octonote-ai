// Imports the official AWS Architecture Icons pack
// (https://aws.amazon.com/architecture/icons/, used under AWS's terms accepted
// at download) into icons/vendor/aws/<eraser-name>.svg, using Eraser's icon
// names (scripts/eraser-icon-names.json) so `[icon: aws-…]` code keeps working.
//
//   node scripts/import-aws-icons.mjs <extracted-pack-dir>
//
// Then run `pnpm icons:vendor` to bundle them.
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node scripts/import-aws-icons.mjs <extracted-pack-dir>');
  process.exit(1);
}
const names = JSON.parse((await import('node:fs')).readFileSync(new URL('./eraser-icon-names.json', import.meta.url), 'utf8')).AWS;
const out = new URL('../icons/vendor/aws/', import.meta.url);

// Eraser names whose AWS service was renamed, or that are AWS categories.
const ALIASES = {
  quicksight: 'quick',
  'kinesis-firehose': 'data-firehose',
  'kinesis-data-analytics': 'managed-service-for-apache-flink',
  'memorydb-for-redis': 'memorydb',
  'fault-injection-simulator': 'fault-injection-service',
  'personal-health-dashboard': 'health-dashboard',
  parallelcluster: 'parallel-cluster',
  'workspaces-family': 'workspaces',
  'contact-center': 'connect',
  'chime-voice-connector': 'chime-sdk',
  'cloud-wan-virtual-pop': 'cloud-wan',
  'server-migration-service': 'application-migration-service',
  'cloudendure-disaster-recovery': 'elastic-disaster-recovery',
  'vmware-cloud-on-aws': 'elastic-vmware-service',
  'machine-learning': 'category:artificial-intelligence',
  'management-governance': 'category:management-tools',
  'security-identity-compliance': 'category:security-identity',
  'migration-transfer': 'category:migration-modernization',
  'game-tech': 'category:games',
  robotics: 'category:internet-of-things',
};
const STOP = new Set(['amazon', 'aws', 'and', 'for', 'the', 'of', 'on']);
const EXPAND = { elb: ['elastic', 'load', 'balancing'], iam: ['identity', 'access', 'management'], nacl: ['network', 'access', 'control', 'list'] };
const ABBREVIATIONS = {
  s3: 'simple-storage-service',
  sqs: 'simple-queue-service',
  sns: 'simple-notification-service',
  ses: 'simple-email-service',
  elb: 'elastic-load-balancing',
  iam: 'identity-and-access-management',
  ebs: 'elastic-block-store',
  ecr: 'elastic-container-registry',
  ecs: 'elastic-container-service',
  eks: 'elastic-kubernetes-service',
  vpc: 'virtual-private-cloud-vpc',
  kms: 'key-management-service',
  swf: 'simple-workflow-service',
  msk: 'managed-streaming-for-apache-kafka',
  sso: 'iam-identity-center',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

// Candidate files: 64px service icons, light resource icons, group icons, 64px category icons.
const files = walk(pack).filter((p) => {
  const f = basename(p);
  if (!f.endsWith('.svg') || /_Dark(_|\.)/.test(f) || p.includes('__MACOSX')) return false;
  if (p.includes('Architecture-Service-Icons')) return f.endsWith('_64.svg');
  if (p.includes('Category-Icons')) return f.endsWith('_64.svg');
  return true;
});
const kind = (p) => (p.includes('Category-Icons') ? 'category' : p.includes('Architecture-Service') ? 'service' : p.includes('Group-Icons') ? 'group' : 'resource');
const keyOf = (p) => norm(basename(p, '.svg').replace(/^(Arch-Category_|Arch_|Res_)/, '').replace(/_(16|32|48|64)(_Light)?$/, ''));
const rank = { service: 0, group: 1, resource: 2, category: 3 };

const exact = new Map();
const categories = new Map();
for (const p of files) {
  const key = keyOf(p);
  if (kind(p) === 'category') categories.set(key, p);
  for (const k of [key, key.replace(/^(amazon|aws)-/, '')]) {
    const prev = exact.get(k);
    if (!prev || rank[kind(p)] < rank[kind(prev)]) exact.set(k, p);
  }
}
const tokens = (s) => s.split('-').flatMap((t) => EXPAND[t] ?? [t]).filter((t) => !STOP.has(t));
const tokenIndex = files.filter((p) => kind(p) !== 'category').map((p) => [p, new Set(tokens(keyOf(p)))]);

const mapping = {};
const missing = [];
for (const name of names) {
  const service = name.slice(4);
  const alias = ALIASES[service];
  let file;
  if (alias?.startsWith('category:')) file = categories.get(alias.slice(9));
  else {
    const candidates = [alias, service, ABBREVIATIONS[service], `amazon-${service}`, `aws-${service}`].filter(Boolean);
    file = candidates.map((c) => exact.get(c)).find(Boolean);
  }
  if (!file) {
    // All of the name's words appear in a file name, with at most three extras.
    const want = tokens(service);
    let best;
    for (const [p, ts] of tokenIndex) {
      if (!want.every((t) => ts.has(t))) continue;
      const score = (ts.size - want.length) * 10 + rank[kind(p)];
      if (ts.size - want.length <= 3 && (!best || score < best[0])) best = [score, p];
    }
    file = best?.[1];
  }
  if (file) mapping[name] = file;
  else missing.push(name);
}

// Group icons commonly used for the outer AWS boundary, beyond Eraser's names.
for (const [name, base] of [['aws-cloud', 'AWS-Cloud-logo_32'], ['aws-region', 'Region_32'], ['aws-corporate-data-center', 'Corporate-data-center_32']]) {
  const file = files.find((p) => basename(p, '.svg') === base);
  if (file && !mapping[name]) mapping[name] = file;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, file] of Object.entries(mapping)) copyFileSync(file, new URL(`${name}.svg`, out));
writeFileSync(
  new URL('SOURCE.md', out),
  `# AWS Architecture Icons

Official icons from the AWS Architecture Icons pack (https://aws.amazon.com/architecture/icons/),
used under the AWS terms accepted at download. Files are renamed to Eraser's icon names.
Imported by scripts/import-aws-icons.mjs from \`${basename(pack)}\`.

Mapped ${Object.keys(mapping).length} of ${names.length} names. Not in the current pack (retired or renamed services):
${missing.map((n) => `- ${n}`).join('\n')}
`,
);
console.log(`aws: mapped ${Object.keys(mapping).length}/${names.length}; missing ${missing.length}`);
