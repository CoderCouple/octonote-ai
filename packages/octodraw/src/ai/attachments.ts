import type { DiagramType } from '../dsl/detect';

// Files given to the assistant: source code, infrastructure definitions,
// schemas, or images (whiteboard photos, screenshots, other tools' diagrams).
// Text files are inlined into the prompt with a hint about what to draw;
// images become image parts, which the host's model adapter forwards.

export interface DiagramAttachment {
  name: string;
  kind: 'text' | 'image';
  /** File contents (text attachments). */
  text?: string;
  /** e.g. image/png (image attachments). */
  mediaType?: string;
  /** Base64 without the data: prefix (image attachments). */
  data?: string;
  /** The text was cut to fit the prompt. */
  truncated?: boolean;
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string };

/** Text of a message whatever its shape (images are skipped). */
export function messageText(content: string | ContentPart[]): string {
  return typeof content === 'string' ? content : content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
}

const ext = (name: string) => /\.([^./\\]+)$/.exec(name.toLowerCase())?.[1] ?? '';

interface Kind {
  label: string;
  fence: string;
  hint: string;
  type?: DiagramType;
}

const CODE_EXTENSIONS: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', py: 'python', go: 'go', java: 'java', kt: 'kotlin', rb: 'ruby', cs: 'csharp', php: 'php', rs: 'rust', swift: 'swift', scala: 'scala', ex: 'elixir', cpp: 'cpp', c: 'c', h: 'c',
};

/** What a file is and what to draw from it. */
export function classifyAttachment(a: Pick<DiagramAttachment, 'name' | 'kind' | 'text'>): Kind {
  if (a.kind === 'image') return { label: 'Image', fence: '', hint: 'An image (a whiteboard sketch, screenshot or another tool’s diagram): recreate it as an octodraw diagram, keeping its boxes, labels, grouping and arrows.' };
  const e = ext(a.name);
  const text = a.text ?? '';
  if (['tf', 'tfvars', 'hcl'].includes(e))
    return { label: 'Terraform', fence: 'hcl', type: 'flow', hint: 'Terraform: draw the infrastructure it defines as an architecture diagram. Group resources by network (VPC, subnet) or module, use the provider’s icons (aws-, gcp-, azure-), and connect resources that reference each other.' };
  if (['yaml', 'yml', 'json'].includes(e) && /AWSTemplateFormatVersion|"?Resources"?\s*:/.test(text) && /Type"?\s*:\s*"?AWS::/.test(text))
    return { label: 'CloudFormation', fence: e === 'json' ? 'json' : 'yaml', type: 'flow', hint: 'CloudFormation: draw the AWS resources as an architecture diagram with aws- icons, grouped by network, connected where one references another.' };
  if (['yaml', 'yml'].includes(e) && /^\s*apiVersion:/m.test(text) && /^\s*kind:/m.test(text))
    return { label: 'Kubernetes', fence: 'yaml', type: 'flow', hint: 'Kubernetes manifests: draw the workloads, services, ingresses and storage with k8s- icons, grouped by namespace, connected by selectors and references.' };
  if (['yaml', 'yml'].includes(e) && /^services:/m.test(text))
    return { label: 'Docker Compose', fence: 'yaml', type: 'flow', hint: 'Docker Compose: draw each service with a fitting icon, its depends_on and network links, and exposed ports as labels.' };
  if (e === 'json' && /"(openapi|swagger)"\s*:/.test(text))
    return { label: 'OpenAPI', fence: 'json', type: 'flow', hint: 'An OpenAPI spec: draw the API’s resources and endpoints grouped by tag, and the data they return.' };
  if (['yaml', 'yml'].includes(e) && /^(openapi|swagger):/m.test(text))
    return { label: 'OpenAPI', fence: 'yaml', type: 'flow', hint: 'An OpenAPI spec: draw the API’s resources and endpoints grouped by tag, and the data they return.' };
  if (e === 'sql' || /\bcreate\s+table\b/i.test(text))
    return { label: 'SQL schema', fence: 'sql', type: 'erd', hint: 'A SQL schema: draw an entity relationship diagram with every table, its columns and types, primary keys, and relationships from the foreign keys.' };
  if (e === 'prisma')
    return { label: 'Prisma schema', fence: 'prisma', type: 'erd', hint: 'A Prisma schema: draw an entity relationship diagram of the models, their fields and relations.' };
  if (e === 'graphql' || e === 'gql')
    return { label: 'GraphQL schema', fence: 'graphql', type: 'erd', hint: 'A GraphQL schema: draw an entity relationship diagram of the types and how they reference each other.' };
  if (CODE_EXTENSIONS[e])
    return { label: 'Source code', fence: CODE_EXTENSIONS[e], hint: 'Source code: draw its structure (modules, classes or services and the calls between them) as an architecture diagram, or a sequence diagram if the request is about how something flows at runtime.' };
  return { label: 'File', fence: e || 'text', hint: 'Use this file as the source for the diagram.' };
}

/** A diagram type the files call for, when they agree on one (SQL → ERD). */
export function suggestDiagramType(attachments: DiagramAttachment[]): DiagramType | undefined {
  const types = new Set(attachments.filter((a) => a.kind === 'text').map((a) => classifyAttachment(a).type));
  return types.size === 1 ? [...types][0] : undefined;
}

/** The prompt text for text attachments (each file fenced, with what to draw from it). */
export function attachmentsText(attachments: DiagramAttachment[]): string {
  return attachments
    .map((a) => {
      const kind = classifyAttachment(a);
      if (a.kind === 'image') return `Attached image "${a.name}". ${kind.hint}`;
      return [`Attached file "${a.name}" (${kind.label}${a.truncated ? ', truncated' : ''}). ${kind.hint}`, '```' + kind.fence, (a.text ?? '').trimEnd(), '```'].join('\n');
    })
    .join('\n\n');
}

const MAX_CHARS = 120_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Reads a browser File into an attachment (images as base64, everything else as text). */
export async function attachmentFromFile(file: File, { maxChars = MAX_CHARS }: { maxChars?: number } = {}): Promise<DiagramAttachment> {
  if (file.type.startsWith('image/')) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    return { name: file.name || 'image.png', kind: 'image', mediaType: file.type, data: btoa(binary) };
  }
  const text = await file.text();
  // Binary files read as text are full of replacement characters.
  if ((text.slice(0, 2000).match(/�/g)?.length ?? 0) > 20) throw new Error(`${file.name} doesn't look like a text file`);
  return text.length > maxChars ? { name: file.name, kind: 'text', text: text.slice(0, maxChars), truncated: true } : { name: file.name, kind: 'text', text };
}

/** Folders and files skipped when a whole folder is attached. */
const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|vendor|target|\.venv|venv|__pycache__|\.terraform|\.idea|\.vscode)(\/|$)/;
const SKIP_FILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|go\.sum|.*\.min\.(js|css)|.*\.map)$/;
const TEXT_EXTENSIONS = new Set([...Object.keys(CODE_EXTENSIONS), 'tf', 'tfvars', 'hcl', 'yaml', 'yml', 'json', 'sql', 'prisma', 'graphql', 'gql', 'md', 'toml', 'ini', 'cfg', 'env.example', 'dockerfile', 'proto']);

/** How useful a file is for a diagram: infrastructure and schemas first, then code, then the rest. */
function fileRank(path: string): number {
  const e = ext(path);
  if (['tf', 'hcl', 'prisma', 'sql', 'graphql', 'proto'].includes(e) || /docker-compose|compose\.ya?ml|k8s|kubernetes|helm|openapi|swagger/i.test(path)) return 0;
  if (['yaml', 'yml', 'toml'].includes(e) || /dockerfile$/i.test(path)) return 1;
  if (CODE_EXTENSIONS[e]) return /test|spec|__tests__|fixtures?/i.test(path) ? 4 : 2;
  return 3;
}

/**
 * A folder (e.g. a repository) as attachments: skips dependencies, build output
 * and lock files, keeps text files, puts infrastructure and schemas first, and
 * stops at `maxFiles` files / `maxChars` characters so the prompt stays usable.
 * Each file is named by its path inside the folder.
 */
export async function attachmentsFromFolder(files: Iterable<File & { webkitRelativePath?: string }>, { maxFiles = 40, maxChars = 300_000 }: { maxFiles?: number; maxChars?: number } = {}): Promise<{ attachments: DiagramAttachment[]; skipped: number }> {
  const candidates = [...files]
    .map((file) => ({ file, path: (file.webkitRelativePath || file.name).replace(/^\.?\//, '') }))
    .filter(({ path, file }) => !SKIP_DIRS.test(path) && !SKIP_FILES.test(path) && file.size < 512_000 && (TEXT_EXTENSIONS.has(ext(path)) || /(^|\/)dockerfile$/i.test(path)))
    .sort((a, b) => fileRank(a.path) - fileRank(b.path) || a.path.length - b.path.length);
  const attachments: DiagramAttachment[] = [];
  let chars = 0;
  for (const { file, path } of candidates) {
    if (attachments.length >= maxFiles || chars >= maxChars) break;
    const text = await file.text().catch(() => '');
    if (!text || (text.slice(0, 2000).match(/�/g)?.length ?? 0) > 20) continue;
    const room = maxChars - chars;
    attachments.push(text.length > room ? { name: path, kind: 'text', text: text.slice(0, room), truncated: true } : { name: path, kind: 'text', text });
    chars += Math.min(text.length, room);
  }
  return { attachments, skipped: [...files].length - attachments.length };
}

export const isZip = (file: File) => file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || ext(file.name) === 'zip';

/**
 * The text files inside a .zip (e.g. a downloaded repository), as Files with
 * their path in `webkitRelativePath`, ready for `attachmentsFromFolder`. Only
 * files that folder attachments would keep are decompressed, and sizes are
 * capped so a hostile archive can't exhaust memory.
 */
export async function filesFromZip(zip: File, { maxTotalBytes = 20_000_000 }: { maxTotalBytes?: number } = {}): Promise<File[]> {
  const { unzip } = await import('fflate');
  const data = new Uint8Array(await zip.arrayBuffer());
  let total = 0;
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      data,
      {
        filter: (entry) => {
          const path = entry.name;
          const wanted = !path.endsWith('/') && !SKIP_DIRS.test(path) && !SKIP_FILES.test(path) && entry.originalSize < 512_000 && (TEXT_EXTENSIONS.has(ext(path)) || /(^|\/)dockerfile$/i.test(path));
          if (!wanted || total + entry.originalSize > maxTotalBytes) return false;
          total += entry.originalSize;
          return true;
        },
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  return Object.entries(entries).map(([path, bytes]) => Object.defineProperty(new File([bytes as BlobPart], path.split('/').pop() ?? path), 'webkitRelativePath', { value: path }));
}

/** owner/repo (and branch, if the URL names one) from a GitHub URL or "owner/repo". */
export function parseGitHubRepo(input: string): { owner: string; repo: string; ref?: string } | null {
  // Another host (anything with a dot before the first slash that isn't github.com) isn't a repository.
  const host = /^(?:https?:\/\/)?([^/]+)\//.exec(input.trim())?.[1];
  if (host && host.includes('.') && !/^(www\.)?github\.com$/i.test(host)) return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^?#]+))?\/?(?:[?#].*)?$/.exec(input.trim());
  return m ? { owner: m[1]!, repo: m[2]!, ...(m[3] ? { ref: decodeURIComponent(m[3]) } : {}) } : null;
}

/**
 * A public GitHub repository as attachments, like attaching its folder: lists
 * the tree with the GitHub API, keeps the files folder attachments would keep
 * (infrastructure and schemas first) and fetches only those. Pass a token for
 * private repositories or a higher API rate limit.
 */
export async function attachmentsFromGitHub(
  url: string,
  options: { token?: string; fetch?: typeof fetch; maxFiles?: number; maxChars?: number } = {},
): Promise<{ attachments: DiagramAttachment[]; skipped: number; repo: string }> {
  const target = parseGitHubRepo(url);
  if (!target) throw new Error('Not a GitHub repository URL (expected github.com/owner/repo)');
  const doFetch = options.fetch ?? fetch;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) };
  const api = async (path: string) => {
    const response = await doFetch(`https://api.github.com/repos/${target.owner}/${target.repo}${path}`, { headers });
    if (response.status === 404) throw new Error(`${target.owner}/${target.repo} wasn't found (private repositories need a token)`);
    if (response.status === 403 || response.status === 429) throw new Error('GitHub rate limit reached; try again later or use a token');
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response.json();
  };
  const ref = target.ref ?? ((await api('')) as { default_branch: string }).default_branch;
  const tree = (await api(`/git/trees/${encodeURIComponent(ref)}?recursive=1`)) as { tree: { path: string; type: string; size?: number }[] };
  const prefix = `${target.repo}/`;
  // Files stand in for the repository's folder; their contents are fetched only if they make the cut.
  const blobs = tree.tree.filter((t) => t.type === 'blob');
  const lazy = blobs.map((t) => {
    const file = Object.defineProperty(new File([], t.path.split('/').pop() ?? t.path), 'webkitRelativePath', { value: prefix + t.path }) as File;
    Object.defineProperty(file, 'size', { value: t.size ?? 0 });
    Object.defineProperty(file, 'text', {
      value: async () => {
        const raw = await doFetch(`https://raw.githubusercontent.com/${target.owner}/${target.repo}/${encodeURIComponent(ref)}/${t.path.split('/').map(encodeURIComponent).join('/')}`, options.token ? { headers: { authorization: `Bearer ${options.token}` } } : undefined);
        return raw.ok ? raw.text() : '';
      },
    });
    return file;
  });
  const { attachments, skipped } = await attachmentsFromFolder(lazy, { maxFiles: options.maxFiles, maxChars: options.maxChars });
  return { attachments, skipped, repo: `${target.owner}/${target.repo}` };
}
