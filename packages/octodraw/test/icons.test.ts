import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listIconNames, loadEraserIcons, loadFullIconCatalog, loadVendorIcons, resolveIcon } from '../src';

describe('resolveIcon', () => {
  it('finds generic icons', () => {
    expect(resolveIcon('server')).toMatchObject({ icon: { kind: 'stroke', title: 'server' } });
    expect(resolveIcon('Database')?.icon.kind).toBe('stroke');
  });

  it('finds brand icons by alias and by slug', () => {
    expect(resolveIcon('postgres')).toMatchObject({ icon: { kind: 'brand', title: 'PostgreSQL' } });
    expect(resolveIcon('postgresql')?.icon.kind).toBe('brand');
    expect(resolveIcon('kafka')).toMatchObject({ icon: { kind: 'brand', title: 'Apache Kafka' } });
  });

  it('maps cloud services to tinted generic glyphs', () => {
    expect(resolveIcon('aws-rds')).toMatchObject({ icon: { kind: 'stroke', title: 'database' }, tint: '#FF9900' });
    expect(resolveIcon('azure-functions')).toMatchObject({ icon: { title: 'function' }, tint: '#0078D4' });
    expect(resolveIcon('gcp-bigquery')).toMatchObject({ icon: { kind: 'brand', title: 'Google BigQuery' } });
    expect(resolveIcon('k8s-pod')).toMatchObject({ icon: { title: 'box' }, tint: '#326CE5' });
  });

  it('falls back to the provider glyph for unknown services', () => {
    expect(resolveIcon('aws-made-up-service')).toMatchObject({ icon: { title: 'cloud' }, tint: '#FF9900' });
    expect(resolveIcon('k8s-unknown')?.icon.kind).toBe('brand');
  });

  it('returns undefined for unknown names', () => {
    expect(resolveIcon('definitely-not-an-icon')).toBeUndefined();
  });

  it('prefers host-supplied icons', () => {
    const custom = { kind: 'brand' as const, title: 'Custom EC2', path: 'M0 0h24v24H0z', color: '#ff9900' };
    expect(resolveIcon('aws-ec2', (name) => (name === 'aws-ec2' ? custom : undefined))?.icon).toBe(custom);
  });

  it('lists names for autocomplete', () => {
    const names = listIconNames();
    expect(names).toContain('server');
    expect(names).toContain('react');
    expect(names).toContain('aws-ec2');
    expect(names).toEqual([...names].sort());
  });
});

describe("coverage of Eraser's icon names (docs.eraser.io/icons)", () => {
  const sections = JSON.parse(readFileSync(new URL('../scripts/eraser-icon-names.json', import.meta.url), 'utf8')) as Record<string, string[]>;
  const coverage = (names: string[]) => names.filter((n) => resolveIcon(n)).length / names.length;

  it('resolves general icons and tech logos once the full catalog is loaded', async () => {
    await loadFullIconCatalog();
    expect(coverage(sections.General!)).toBeGreaterThan(0.97);
    expect(coverage(sections['Tech logos']!)).toBeGreaterThan(0.8);
  });

  it('gives every cloud, Kubernetes and networking name a glyph', () => {
    for (const section of ['AWS', 'Google Cloud', 'Azure', 'Oracle Cloud', 'Kubernetes', 'Networking']) {
      expect(coverage(sections[section]!), section).toBe(1);
    }
  });

  it('picks service glyphs from keywords', () => {
    expect(resolveIcon('azure-cosmos-db')?.icon.title).toBe('database');
    expect(resolveIcon('aws-elastic-load-balancing')?.icon.title).toBe('load-balancer');
    expect(resolveIcon('gcp-cloud-functions')?.icon.title).toBe('function');
    expect(resolveIcon('azure-service-bus')?.icon.title).toBe('queue');
    expect(resolveIcon('oci-autonomous-database')).toMatchObject({ icon: { title: 'database' }, tint: '#C74634' });
    expect(resolveIcon('cisco-router')).toMatchObject({ icon: { title: 'network' }, tint: '#049FD9' });
  });
});

describe("Eraser's icon artwork (temporary, see icons/eraser/NOTICE.md)", () => {
  it('resolves to images once loaded, ahead of the open-source catalog', async () => {
    await loadEraserIcons();
    const icon = resolveIcon('aws-ec2', undefined, 'eraser')?.icon;
    expect(icon).toMatchObject({ kind: 'inline', title: 'aws-ec2' });
    expect(icon?.kind === 'inline' && icon.body.length > 0 && !/<script|\son\w+=/i.test(icon.body)).toBe(true);
  });

  it("is skipped with iconSet 'open'", () => {
    expect(resolveIcon('aws-ec2', undefined, 'open')?.icon.kind).toBe('stroke');
  });

  it("lets a host pack win over Eraser's artwork", () => {
    const vendor = { kind: 'image' as const, title: 'EC2', href: 'https://example.com/ec2.svg' };
    expect(resolveIcon('aws-ec2', () => vendor, 'eraser')?.icon).toBe(vendor);
  });
});

describe('licensed vendor icons (icons/vendor)', () => {
  it('use the official AWS icon ahead of Eraser artwork, in either icon set', async () => {
    await loadVendorIcons();
    await loadEraserIcons();
    for (const set of ['eraser', 'open'] as const) {
      const icon = resolveIcon('aws-lambda', undefined, set)?.icon;
      expect(icon?.kind).toBe('inline');
    }
  });
});

describe('short aliases', () => {
  it('resolve aws-s3 and friends to the full vendor names', async () => {
    await loadVendorIcons();
    expect(resolveIcon('aws-s3')?.icon.kind).toBe('inline');
    expect(resolveIcon('aws-sqs')?.icon.kind).toBe('inline');
    expect(resolveIcon('aws-cloud')?.icon.kind).toBe('inline');
  });
});

describe('Azure vendor icons', () => {
  it('map Eraser names, including services Microsoft renamed', async () => {
    await loadVendorIcons();
    expect(resolveIcon('azure-cosmos-db')?.icon.kind).toBe('inline');
    expect(resolveIcon('azure-security-center')?.icon.kind).toBe('inline');
    expect(resolveIcon('azure-data-factory')?.icon.kind).toBe('inline');
  });
});

describe('forgiving provider names', () => {
  it('finds the closest vendor icon for natural names', async () => {
    await loadVendorIcons();
    for (const name of ['azure-key-vault', 'azure-front-door', 'azure-functions', 'azure-api-management', 'azure-event-grid']) {
      expect(resolveIcon(name)?.icon.kind, name).toBe('inline');
    }
  });

  it('still falls back to a tinted glyph when nothing is close', () => {
    expect(resolveIcon('azure-made-up-thing-xyz')).toMatchObject({ icon: { kind: 'stroke' }, tint: '#0078D4' });
  });
});
