import { describe, expect, it } from 'vitest';
import { layoutBpmn } from '../src/bpmn/bpmn';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';
import { detectDiagramType } from '../src/dsl/detect';
import { parseDiagram } from '../src/dsl/parse';
import { validateDiagram } from '../src/ai/generate';

const src = FIGURE_TEMPLATES.find((t) => t.id === 'bpmn')!.source;

describe('BPMN', () => {
  it('is detected from typed flow objects and parses cleanly', () => {
    expect(detectDiagramType(src)).toBe('bpmn');
    expect(detectDiagramType('A > B')).toBe('flow');
    expect(parseDiagram(src).diagnostics).toEqual([]);
    expect(validateDiagram(src).errors).toEqual([]);
    expect(parseDiagram('A [type: blob]').diagnostics[0]?.severity).toBe('warning');
  });

  it('lays out pools and lanes as bands, steps in flow columns and lane rows', () => {
    const l = layoutBpmn(parseDiagram(src));
    const band = (id: string) => l.bands.find((b) => b.id === id)!;
    const el = (id: string) => l.elements.find((e) => e.id === id)!;
    expect(band('Customer').kind).toBe('pool');
    expect(band('Sales').kind).toBe('lane');
    // Lanes sit inside their pool, one under the other.
    expect(band('Sales').y).toBeGreaterThanOrEqual(band('Shop').y);
    expect(band('Warehouse').y).toBeGreaterThanOrEqual(band('Sales').y + band('Sales').height - 1);
    // Each step is inside its lane's band.
    const inside = (e: ReturnType<typeof el>, b: ReturnType<typeof band>) => e.y >= b.y && e.y + e.height <= b.y + b.height;
    expect(inside(el('Check stock'), band('Sales'))).toBe(true);
    expect(inside(el('Ship order'), band('Warehouse'))).toBe(true);
    // Flow order is left to right.
    expect(el('Check stock').x).toBeGreaterThan(el('Order placed').x);
    expect(el('In stock?').x).toBeGreaterThan(el('Check stock').x);
    expect(el('Pack').x).toBeGreaterThan(el('In stock?').x);
    expect(el('Ship order').x).toBeGreaterThan(el('Pack').x);
    // Starts thin, ends thick.
    expect(el('Order placed').role).toBe('start');
    expect(el('Done').role).toBe('end');
    expect(el('In stock?').type).toBe('gateway');
    expect(l.edges).toHaveLength(14);
  });

  it('reads gateway kinds, event triggers and intermediate events', () => {
    const l = layoutBpmn(parseDiagram(src));
    const el = (id: string) => l.elements.find((e) => e.id === id)!;
    expect(el('Pack').gateway).toBe('parallel');
    expect(el('In stock?').gateway).toBe('exclusive');
    expect(el('Order placed')).toMatchObject({ trigger: 'message', role: 'start', pool: 'Customer' });
    expect(el('Wait for stock')).toMatchObject({ trigger: 'timer', role: 'intermediate', pool: 'Shop' });
  });

  it('subprocesses, data stores, and hand placement that keeps an element in its lane', () => {
    const d = parseDiagram(src);
    const auto = layoutBpmn(d);
    const el = (l: typeof auto, id: string) => l.elements.find((e) => e.id === id)!;
    expect(el(auto, 'Ship order').type).toBe('subprocess');
    expect(el(auto, 'Inventory').type).toBe('store');
    const sales = auto.bands.find((b) => b.id === 'Sales')!;
    const moved = layoutBpmn(d, { placements: { 'Notify delay': { x: 900, y: -500 } } });
    const nd = el(moved, 'Notify delay');
    expect(nd.x).toBe(900);
    // Pulled back inside the Sales lane.
    expect(nd.y).toBeGreaterThanOrEqual(sales.y);
    expect(nd.y + nd.height).toBeLessThanOrEqual(sales.y + sales.height);
  });

  it('puts boundary events on their task\'s bottom edge', () => {
    const l = layoutBpmn(parseDiagram(src));
    const el = (id: string) => l.elements.find((e) => e.id === id)!;
    const host = el('Ship order');
    const ev = el('Lost in transit');
    expect(ev).toMatchObject({ attached: 'Ship order', role: 'intermediate', trigger: 'error' });
    expect(ev.y + ev.height / 2).toBeCloseTo(host.y + host.height);
    expect(ev.x).toBeGreaterThan(host.x);
    expect(ev.x + ev.width).toBeLessThanOrEqual(host.x + host.width);
    // The next element down the lane starts below the event's label.
    expect(el('Send invoice').y).toBeGreaterThan(ev.labelBox!.y + ev.labelBox!.height);
  });
});
