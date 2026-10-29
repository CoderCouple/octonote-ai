import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildView, parseDiagram } from '../src';
import { chooseNodeVariants } from '../src/layout/layout';

// Checks the card/icon heuristic against what Eraser actually generated for
// the corpus examples (Icon vs Shape elements in its JSON).
const corpus = new URL('../corpus/', import.meta.url);
const EXAMPLES = ['01-food-delivery', '02-ecommerce-aws', '03-ci-cd-pipeline', '04-kubernetes-cluster', '05-data-platform', '06-auth-flowchart', '07-service-mesh'];

describe('node variants match Eraser', () => {
  it.each(EXAMPLES)('%s', (name) => {
    const diagram = parseDiagram(readFileSync(new URL(`${name}.eraser`, corpus), 'utf8'));
    const ours = chooseNodeVariants(buildView(diagram, { focus: null }));
    const eraser = JSON.parse(readFileSync(new URL(`${name}.json`, corpus), 'utf8')) as { elements: { tag: string; texts?: { text: string }[] }[] };
    const mismatches: string[] = [];
    let compared = 0;
    for (const e of eraser.elements) {
      if (e.tag !== 'Icon' && e.tag !== 'Shape') continue;
      const label = e.texts?.[0]?.text ?? '';
      const node = [...diagram.nodes.values()].find((n) => n.label === label);
      if (!node) continue;
      compared++;
      const expected = e.tag === 'Icon' ? 'icon' : 'card';
      if (ours.get(node.id) !== expected) mismatches.push(`${label}: ours=${ours.get(node.id)} eraser=${expected}`);
    }
    expect(compared).toBeGreaterThan(5);
    expect(mismatches).toEqual([]);
  });
});
