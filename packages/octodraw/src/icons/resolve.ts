import { CORE_ICONS } from './generated-core';
import type { IconCatalog, IconDef, IconResolver, ResolvedIcon } from './types';

// Icon lookup for `[icon: name]`, accepting Eraser's icon names
// (https://docs.eraser.io/icons).
//
// - Generic names are Lucide icons; tech logos are Simple Icons.
// - Cloud/k8s/networking names (aws-*, gcp-*, azure-*, oci-*, k8s-*, cisco-*)
//   resolve to a generic glyph tinted with the provider's color: the official
//   AWS/Azure/GCP sets carry their own usage terms. Hosts that have cleared
//   them can supply them through an IconResolver.
// - A small curated core is bundled; the full catalog (~1,900 generic icons
//   and ~550 logos) loads lazily via loadFullIconCatalog().

const catalogs: IconCatalog[] = [CORE_ICONS];
let fullLoad: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** Loads the full icon catalog once; resolves when it's available to resolveIcon. */
export function loadFullIconCatalog(): Promise<void> {
  fullLoad ??= import('./generated-full').then(({ FULL_ICONS }) => {
    catalogs.push(FULL_ICONS);
    for (const listener of listeners) listener();
  });
  return fullLoad;
}

// Eraser's own artwork (temporary, see icons/eraser/NOTICE.md), used ahead of
// the open-source catalog when the icon set is 'eraser'.
let eraserIcons: Record<string, [viewBox: string, attrs: Record<string, string>, body: string]> | undefined;
let eraserLoad: Promise<void> | undefined;

// Licensed vendor packs (icons/vendor/*, e.g. the official AWS icons); checked
// before Eraser's artwork and used with either icon set.
let vendorIcons: Record<string, [viewBox: string, attrs: Record<string, string>, body: string]> | undefined;
let vendorLoad: Promise<void> | undefined;

/** Loads the bundled vendor icon packs once (lazily). */
export function loadVendorIcons(): Promise<void> {
  vendorLoad ??= import('./generated-vendor').then(({ VENDOR_ICONS }) => {
    vendorIcons = VENDOR_ICONS;
    fuzzyCache.clear();
    for (const listener of listeners) listener();
  });
  return vendorLoad;
}

/** Which artwork to prefer: Eraser's icons (temporary) or the open-source catalog. */
export type IconSet = 'eraser' | 'open';

/** Loads Eraser's icon artwork once (~1.3MB gzipped, lazily). */
export function loadEraserIcons(): Promise<void> {
  eraserLoad ??= import('./generated-eraser').then(({ ERASER_ICONS }) => {
    eraserIcons = ERASER_ICONS;
    fuzzyCache.clear();
    for (const listener of listeners) listener();
  });
  return eraserLoad;
}

function inlineIcon(source: typeof eraserIcons, key: string): IconDef | undefined {
  const entry = source?.[key];
  if (!entry) return undefined;
  const [viewBox, attrs, body] = entry;
  return { kind: 'inline', title: key, viewBox, attrs, body };
}

/** Called when more icons become available (e.g. the full catalog finished loading). */
export function onIconCatalogChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface Provider {
  color: string;
  fallback: string;
  /** Explicit service → glyph mappings; keyword rules cover the rest. */
  services?: Record<string, string>;
}

const PROVIDERS: Record<string, Provider> = {
  aws: {
    color: '#FF9900',
    fallback: 'cloud',
    services: { ec2: 'server', s3: 'bucket', sqs: 'queue', sns: 'notification', vpc: 'cloud', iam: 'auth', cognito: 'users', route53: 'compass', 'route-53': 'compass', cloudfront: 'globe', ses: 'mail', waf: 'firewall' },
  },
  gcp: { color: '#4285F4', fallback: 'cloud', services: { gcs: 'brand:googlecloudstorage', 'cloud-storage': 'brand:googlecloudstorage', bigquery: 'brand:googlebigquery', pubsub: 'brand:googlepubsub', 'pub-sub': 'brand:googlepubsub', spanner: 'brand:googlecloudspanner', bigtable: 'brand:googlebigtable', dataflow: 'brand:googledataflow', dataproc: 'brand:googledataproc' } },
  azure: { color: '#0078D4', fallback: 'cloud' },
  oci: { color: '#C74634', fallback: 'cloud' },
  // Listed with Azure on docs.eraser.io: Dynamics 365 and Microsoft Fabric.
  d365: { color: '#0B53CE', fallback: 'building' },
  dynamics: { color: '#0B53CE', fallback: 'building' },
  fabric: { color: '#117865', fallback: 'analytics' },
  microsoft: { color: '#0078D4', fallback: 'cloud' },
  power: { color: '#742774', fallback: 'workflow', services: { bi: 'chart', apps: 'browser', automate: 'workflow', pages: 'globe', dataverse: 'database', fx: 'code' } },
  k8s: {
    color: '#326CE5',
    fallback: 'brand:kubernetes',
    services: { pod: 'box', deploy: 'layers', deployment: 'layers', svc: 'network', service: 'network', ing: 'gateway', ingress: 'gateway', node: 'server', ns: 'folder', namespace: 'folder', cm: 'config', configmap: 'config', secret: 'lock', job: 'worker', cronjob: 'cron', pv: 'storage', pvc: 'storage', sts: 'database', statefulset: 'database', ds: 'boxes', daemonset: 'boxes', rs: 'layers', replicaset: 'layers', hpa: 'metrics', etcd: 'database', 'api-server': 'gateway', api: 'gateway', 'control-plane': 'cluster' },
  },
  cisco: { color: '#049FD9', fallback: 'network' },
};

/**
 * Glyph for a cloud service from keywords in its name, first match wins
 * (e.g. azure-cosmos-db → database, aws-elastic-load-balancing → split).
 */
const SERVICE_KEYWORDS: [RegExp, string][] = [
  [/load-?balanc|\belb\b|\balb\b|\bnlb\b|traffic-manager|front-door/, 'load-balancer'],
  [/cache|redis|memcache|memorystore/, 'cache'],
  [/\bdb\b|database|sql|aurora|\brds\b|dynamo|cosmos|spanner|bigtable|firestore|datastore|neptune|documentdb|keyspaces|timestream|mongo|postgres|mysql|maria/, 'database'],
  [/warehouse|redshift|synapse|bigquery|snowflake/, 'warehouse'],
  [/function|lambda|serverless/, 'function'],
  [/queue|\bsqs\b|\bmq\b|service-bus|pub-?sub|\bsns\b|notification|event|kinesis|stream|kafka|eventbridge|event-?hub|event-?grid/, 'queue'],
  [/container|\becs\b|\beks\b|\baks\b|\bgke\b|fargate|kubernetes|docker|registry|\becr\b|\bacr\b|openshift/, 'container'],
  [/backup|archive|glacier|vault-storage/, 'archive'],
  [/storage|bucket|\bs3\b|blob|disk|\bebs\b|\befs\b|\bfsx\b|file-?share|data-lake|\bfile\b/, 'bucket'],
  [/\bdns\b|route-?53|domain/, 'compass'],
  [/\bcdn\b|cloudfront|edge|global-accelerator/, 'globe'],
  [/firewall|\bwaf\b|ddos|shield|armor/, 'firewall'],
  [/\bkms\b|\bkey\b|keys|secret|vault|certificate|\bhsm\b/, 'key'],
  [/iam|identity|directory|\bad\b|entra|cognito|auth|\bsso\b|access/, 'auth'],
  [/security|guard|sentinel|defender|inspector|macie|compliance|policy|threat/, 'shield'],
  [/monitor|watch|insight|trace|x-ray|metric|observab|health/, 'monitoring'],
  [/\blogs?\b|logging|trail|audit/, 'logs'],
  [/\bai\b|\bml\b|machine-learning|sagemaker|bedrock|vertex|cognitive|openai|\bbot\b|lex|polly|rekognition|comprehend|translat|speech|vision|gemini|copilot|agent/, 'brain'],
  [/analytic|athena|glue|\bemr\b|databricks|dataflow|dataproc|quicksight|power-?bi|data-factory|looker|kusto/, 'analytics'],
  [/api|apim|appsync|endpoint|graphql/, 'api'],
  [/gateway|\bnat\b|vpn|direct-?connect|express-?route|interconnect|peering|transit/, 'gateway'],
  [/\bvpc\b|vnet|virtual-network|subnet|network|private-link|router|switch/, 'network'],
  [/\biot\b|device|sensor|edge-?device|greengrass/, 'iot'],
  [/mail|\bses\b|sendgrid|smtp/, 'mail'],
  [/\bvm\b|virtual-machine|\bec2\b|compute|instance|server|host|bare-metal|lightsail|batch/, 'server'],
  [/devops|codecommit|codebuild|codedeploy|codepipeline|pipeline|build|deploy|repo|artifact/, 'pipeline'],
  [/workflow|step-functions|logic-app|orchestrat|scheduler|cron/, 'workflow'],
  [/app-service|web-app|static-web|amplify|app-engine|cloud-run|app-runner|elastic-beanstalk|\bapp\b/, 'browser'],
  [/mobile|phone/, 'mobile'],
  [/user|users|account|organization|tenant|subscription|management-group/, 'users'],
  [/cost|billing|budget|pricing|marketplace/, 'money'],
  [/access-point|wireless|wifi|wlan/, 'wifi'],
];

/** Common short names → Eraser's full icon names (which spell AWS services out). */
const ALIASES: Record<string, string> = {
  'aws-s3': 'aws-simple-storage-service',
  'aws-glacier': 'aws-simple-storage-service-glacier',
  'aws-sqs': 'aws-simple-queue-service',
  'aws-sns': 'aws-simple-notification-service',
  'aws-ses': 'aws-simple-email-service',
  'aws-elb': 'aws-elastic-load-balancing',
  'aws-alb': 'aws-elb-application-load-balancer',
  'aws-nlb': 'aws-elb-network-load-balancer',
  'aws-ebs': 'aws-elastic-block-store',
  'aws-efs': 'aws-elastic-file-system',
  'aws-ecr': 'aws-elastic-container-registry',
  'aws-ecs': 'aws-elastic-container-service',
  'aws-eks': 'aws-elastic-kubernetes-service',
  'azure-blob-storage': 'azure-storage-accounts',
  'azure-blob': 'azure-storage-accounts',
  'azure-storage': 'azure-storage-accounts',
};

const singular = (t: string) => (t.length > 4 && t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
const NAME_STOP = new Set(['azure', 'microsoft', 'aws', 'amazon', 'gcp', 'google', 'cloud', 'oci', 'and', 'for', 'the', 'of', 'service', 'services']);
const nameTokens = (s: string) => s.split('-').slice(1).map(singular).filter((t) => t && !NAME_STOP.has(t));
const fuzzyCache = new Map<string, string | null>();

/**
 * The closest artwork name from the same provider for a name that isn't an
 * exact match: e.g. azure-key-vault → azure-key-vaults, azure-functions →
 * azure-function-apps. All of the query's words must appear (singular/plural
 * insensitive), with at most two extra words.
 */
function closestArtworkName(key: string, set: IconSet): string | undefined {
  const prefix = key.slice(0, key.indexOf('-') + 1);
  if (!prefix || !vendorIcons) return undefined;
  const cacheKey = `${set}:${key}:${eraserIcons ? 1 : 0}`;
  const cached = fuzzyCache.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;
  const want = nameTokens(key);
  let best: [number, string] | undefined;
  if (want.length) {
    const pools = [vendorIcons, set === 'eraser' ? eraserIcons : undefined];
    pools.forEach((pool, poolIndex) => {
      for (const candidate of Object.keys(pool ?? {})) {
        if (!candidate.startsWith(prefix)) continue;
        const have = new Set(nameTokens(candidate));
        if (!want.every((t) => have.has(t)) || have.size - want.length > 2) continue;
        const score = (have.size - want.length) * 10 + poolIndex;
        if (!best || score < best[0]) best = [score, candidate];
      }
    });
  }
  fuzzyCache.set(cacheKey, best?.[1] ?? null);
  return best?.[1];
}

/** Looks up an icon by the name written in `[icon: ...]`. */
export function resolveIcon(name: string, custom?: IconResolver, set: IconSet = 'open'): ResolvedIcon | undefined {
  const raw = name.trim().toLowerCase();
  const has = (k: string) => !!(vendorIcons?.[k] || (set === 'eraser' && eraserIcons?.[k]));
  const aliased = ALIASES[raw] && has(ALIASES[raw]) ? ALIASES[raw] : raw;
  const key = has(aliased) ? aliased : (closestArtworkName(aliased, set) ?? aliased);
  const fromHost = custom?.(raw) ?? (key !== raw ? custom?.(key) : undefined);
  if (fromHost) return { icon: fromHost };

  const fromVendor = inlineIcon(vendorIcons, key);
  if (fromVendor) return { icon: fromVendor };

  if (set === 'eraser') {
    const fromEraser = inlineIcon(eraserIcons, key);
    if (fromEraser) return { icon: fromEraser };
  }

  const direct = builtin(key);
  if (direct) return { icon: direct };

  // "azureattestation" style names carry the provider without a dash.
  const dash = key.indexOf('-');
  const prefix = dash > 0 ? key.slice(0, dash) : key.startsWith('azure') ? 'azure' : '';
  const provider = PROVIDERS[prefix];
  if (provider) {
    const service = dash > 0 ? key.slice(dash + 1) : key.slice(prefix.length);
    const target = provider.services?.[service] ?? SERVICE_KEYWORDS.find(([pattern]) => pattern.test(service))?.[1] ?? provider.fallback;
    const icon = builtin(target) ?? builtin(provider.fallback);
    if (icon) return { icon, tint: icon.kind === 'stroke' ? provider.color : undefined };
  }
  return undefined;
}

/** Every icon name currently available (more after loadFullIconCatalog), for autocomplete. */
export function listIconNames(): string[] {
  const names = new Set<string>();
  for (const c of catalogs) {
    for (const n of Object.keys(c.generic)) names.add(n);
    for (const n of Object.keys(c.brands)) names.add(n);
    for (const n of Object.keys(c.brandAliases)) names.add(n);
    for (const n of c.cloudNames) names.add(n);
  }
  for (const n of Object.keys(eraserIcons ?? {})) names.add(n);
  for (const n of Object.keys(vendorIcons ?? {})) names.add(n);
  for (const [prefix, provider] of Object.entries(PROVIDERS)) {
    for (const service of Object.keys(provider.services ?? {})) names.add(`${prefix}-${service}`);
  }
  return [...names].sort();
}

function builtin(key: string): IconDef | undefined {
  if (key.startsWith('brand:')) return brand(key.slice(6));
  for (const c of catalogs) {
    const elements = c.generic[key];
    if (elements) return { kind: 'stroke', title: key, elements };
  }
  return brand(key);
}

function brand(name: string): IconDef | undefined {
  for (const c of catalogs) {
    const slug = c.brandAliases[name] ?? name;
    for (const d of catalogs) {
      const icon = d.brands[slug];
      if (icon) return { kind: 'brand', title: icon.title, path: icon.path, color: icon.hex };
    }
  }
  return undefined;
}
