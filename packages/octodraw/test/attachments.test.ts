import { describe, expect, it } from 'vitest';
import { attachmentsFromFolder, classifyAttachment, messageText, suggestDiagramType, type DiagramAttachment } from '../src/ai/attachments';
import { buildUserContent, generateDiagram, type DiagramModelRequest } from '../src/ai/generate';

const tf: DiagramAttachment = { name: 'main.tf', kind: 'text', text: 'resource "aws_s3_bucket" "b" {}\nresource "aws_lambda_function" "f" {}' };
const sql: DiagramAttachment = { name: 'schema.sql', kind: 'text', text: 'CREATE TABLE users (id int primary key);' };
const k8s: DiagramAttachment = { name: 'deploy.yaml', kind: 'text', text: 'apiVersion: apps/v1\nkind: Deployment\n' };
const png: DiagramAttachment = { name: 'whiteboard.png', kind: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' };

describe('attachments', () => {
  it('recognises what a file is', () => {
    expect(classifyAttachment(tf).label).toBe('Terraform');
    expect(classifyAttachment(sql)).toMatchObject({ label: 'SQL schema', type: 'erd' });
    expect(classifyAttachment(k8s).label).toBe('Kubernetes');
    expect(classifyAttachment({ name: 'compose.yml', kind: 'text', text: 'services:\n  web: {}' }).label).toBe('Docker Compose');
    expect(classifyAttachment({ name: 'api.ts', kind: 'text', text: 'export {}' }).label).toBe('Source code');
    expect(classifyAttachment(png).label).toBe('Image');
  });

  it('suggests a diagram type only when the files agree', () => {
    expect(suggestDiagramType([sql])).toBe('erd');
    expect(suggestDiagramType([sql, tf])).toBeUndefined();
  });

  it('inlines text files and sends images as parts', () => {
    const text = buildUserContent('', [], undefined, [tf]);
    expect(typeof text).toBe('string');
    expect(text).toContain('Attached file "main.tf" (Terraform)');
    expect(text).toContain('```hcl');
    expect(text).toContain('Draw a diagram of the attached files.');
    const parts = buildUserContent('Recreate this', [], undefined, [png]);
    expect(Array.isArray(parts)).toBe(true);
    expect((parts as { type: string }[]).map((p) => p.type)).toEqual(['image', 'text']);
    expect(messageText(parts)).toContain('Recreate this');
  });

  it('a SQL file makes the request an ERD', async () => {
    let seen: DiagramModelRequest | undefined;
    const result = await generateDiagram({
      model: async (req) => {
        seen = req;
        return '```octodraw\nnotation crows-feet\nusers {\n  id int pk\n}\n```';
      },
      prompt: '',
      attachments: [sql],
    });
    expect(result.type).toBe('erd');
    expect(seen!.system).toContain('entity relationship diagram');
    expect(messageText(seen!.messages[0]!.content)).toContain('CREATE TABLE users');
  });

  it('turns a folder into attachments: skips dependencies, ranks infrastructure first, caps size', async () => {
    const file = (path: string, text: string) => Object.defineProperty(new File([text], path.split('/').pop()!), 'webkitRelativePath', { value: path });
    const { attachments, skipped } = await attachmentsFromFolder(
      [
        file('repo/src/app.ts', 'export const app = 1;'),
        file('repo/node_modules/lib/index.js', 'x'),
        file('repo/infra/main.tf', 'resource "aws_s3_bucket" "b" {}'),
        file('repo/pnpm-lock.yaml', 'lock'),
        file('repo/logo.png', 'binary'),
        file('repo/src/app.test.ts', 'test()'),
        file('repo/db/schema.sql', 'CREATE TABLE t (id int);'),
      ],
      { maxChars: 10_000 },
    );
    expect(attachments.map((a) => a.name)).toEqual(['repo/infra/main.tf', 'repo/db/schema.sql', 'repo/src/app.ts', 'repo/src/app.test.ts']);
    expect(skipped).toBe(3);
    const capped = await attachmentsFromFolder([file('a/big.ts', 'x'.repeat(500)), file('a/b.ts', 'y')], { maxChars: 100 });
    expect(capped.attachments[0]).toMatchObject({ name: 'a/b.ts' });
    expect(capped.attachments[1]).toMatchObject({ truncated: true });
    expect(capped.attachments[1]!.text).toHaveLength(99);
  });
});

describe('zip attachments', () => {
  it('unpacks the useful text files of a zip with their paths', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const { filesFromZip, attachmentsFromFolder, isZip } = await import('../src/ai/attachments');
    const bytes = zipSync({
      'repo-main/infra/main.tf': strToU8('resource "aws_s3_bucket" "b" {}'),
      'repo-main/src/app.ts': strToU8('export {}'),
      'repo-main/node_modules/x/index.js': strToU8('skip me'),
      'repo-main/logo.png': new Uint8Array([137, 80, 78, 71]),
    });
    const zip = new File([bytes], 'repo-main.zip', { type: 'application/zip' });
    expect(isZip(zip)).toBe(true);
    const files = await filesFromZip(zip);
    expect(files.map((f) => (f as File & { webkitRelativePath: string }).webkitRelativePath).sort()).toEqual(['repo-main/infra/main.tf', 'repo-main/src/app.ts']);
    const { attachments } = await attachmentsFromFolder(files);
    expect(attachments[0]).toMatchObject({ name: 'repo-main/infra/main.tf', text: 'resource "aws_s3_bucket" "b" {}' });
  });
});

describe('GitHub repository import', () => {
  it('parses repository URLs', async () => {
    const { parseGitHubRepo } = await import('../src/ai/attachments');
    expect(parseGitHubRepo('https://github.com/acme/shop')).toEqual({ owner: 'acme', repo: 'shop' });
    expect(parseGitHubRepo('github.com/acme/shop.git')).toEqual({ owner: 'acme', repo: 'shop' });
    expect(parseGitHubRepo('acme/shop')).toEqual({ owner: 'acme', repo: 'shop' });
    expect(parseGitHubRepo('https://github.com/acme/shop/tree/dev')).toEqual({ owner: 'acme', repo: 'shop', ref: 'dev' });
    expect(parseGitHubRepo('https://example.com/x')).toBeNull();
  });

  it('lists the tree and fetches only the files that make the cut', async () => {
    const { attachmentsFromGitHub } = await import('../src/ai/attachments');
    const fetched: string[] = [];
    const fake = (async (url: string) => {
      fetched.push(url);
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (url === 'https://api.github.com/repos/acme/shop') return json({ default_branch: 'main' });
      if (url.startsWith('https://api.github.com/repos/acme/shop/git/trees/main')) return json({ tree: [{ path: 'infra/main.tf', type: 'blob', size: 30 }, { path: 'node_modules/x.js', type: 'blob', size: 5 }, { path: 'src', type: 'tree' }, { path: 'src/app.ts', type: 'blob', size: 9 }, { path: 'logo.png', type: 'blob', size: 900 }] });
      if (url.endsWith('/infra/main.tf')) return new Response('resource "aws_s3_bucket" "b" {}');
      if (url.endsWith('/src/app.ts')) return new Response('export {}');
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const { attachments, repo } = await attachmentsFromGitHub('https://github.com/acme/shop', { fetch: fake });
    expect(repo).toBe('acme/shop');
    expect(attachments.map((a) => a.name)).toEqual(['shop/infra/main.tf', 'shop/src/app.ts']);
    expect(attachments[0]!.text).toContain('aws_s3_bucket');
    expect(fetched.some((u) => u.includes('node_modules') || u.includes('logo.png'))).toBe(false);
  });
});
