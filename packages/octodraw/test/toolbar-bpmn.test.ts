import { describe, expect, it } from 'vitest';
import { layoutBpmn } from '../src/bpmn/bpmn';
import { FIGURE_TEMPLATES } from '../src/canvas/templates';
import { detectDiagramType } from '../src/dsl/detect';
import { parseDiagram } from '../src/dsl/parse';
import { buildView } from '../src/view/view';
import { runToolbarAction, toolbarControls, type DiagramSelection, type ToolbarAction, type ToolbarContext } from '../src/react/toolbar/actions';
import { BPMN_TYPES, bpmnLineValue, bpmnTypeValue, connectionKind, eventTriggerValue, gatewayKindValue } from '../src/react/toolbar/bpmn';

// The element toolbar on BPMN (swimlane) diagrams: controls per selection and the
// code each action writes. Flow behaviour is covered by toolbar.test.ts.

const SRC = FIGURE_TEMPLATES.find((t) => t.id === 'bpmn')!.source;
const AI_EXAMPLE = `Customer [color: blue] {
  Place order [type: activity]
}
Shop {
  Sales {
    Order received [type: event]
    In stock? [type: gateway]
  }
  Warehouse {
    Ship order
  }
}
Place order > Order received > In stock?
In stock? > Ship order: yes`;
const EXAMPLES = [SRC, AI_EXAMPLE];

function ctxOf(source: string): ToolbarContext {
  const diagram = parseDiagram(source);
  const view = buildView(diagram, { focus: null });
  const sources = new Map(view.edges.map((e) => [e.id, e.sources]));
  return { diagram, edgeSources: (id) => sources.get(id) ?? diagram.edges.filter((e) => e.id === id), bpmn: true };
}
const node = (...ids: string[]): DiagramSelection => ({ kind: 'node', ids });
const edge = (...ids: string[]): DiagramSelection => ({ kind: 'edge', ids });
const edgeId = (source: string, from: string, to: string) => parseDiagram(source).edges.find((e) => e.from === from && e.to === to)!.id;
const errors = (source: string) => parseDiagram(source).diagnostics.filter((d) => d.severity === 'error');
const warnings = (source: string) => parseDiagram(source).diagnostics.length;

/** Runs an action; the result must still parse cleanly, be a BPMN diagram and lay out. */
function run(source: string, action: ToolbarAction, selection: DiagramSelection): string {
  const result = runToolbarAction(source, action, selection, ctxOf(source));
  if (!result.ok) throw new Error(`refused: ${result.reason ?? 'no change'}`);
  expect(errors(result.source)).toEqual([]);
  expect(warnings(result.source)).toBeLessThanOrEqual(warnings(source));
  expect(detectDiagramType(result.source)).toBe('bpmn');
  expect(() => layoutBpmn(parseDiagram(result.source))).not.toThrow();
  return result.source;
}
const lineOf = (source: string, name: string) => source.split('\n').find((l) => l.trim().startsWith(name))?.trim();

describe('BPMN toolbar controls', () => {
  const ctx = ctxOf(SRC);

  it('elements: type, then gateway kind or event trigger', () => {
    expect(toolbarControls(node('Check stock'), ctx)).toEqual(['editText', 'bpmnType', 'color', 'more']);
    expect(toolbarControls(node('Ship order'), ctx)).toEqual(['editText', 'bpmnType', 'color', 'more']);
    expect(toolbarControls(node('In stock?'), ctx)).toEqual(['editText', 'bpmnType', 'gatewayKind', 'color', 'more']);
    expect(toolbarControls(node('Wait for stock'), ctx)).toEqual(['editText', 'bpmnType', 'eventTrigger', 'color', 'more']);
    expect(toolbarControls(node('Inventory'), ctx)).toEqual(['editText', 'bpmnType', 'color', 'more']);
  });

  it('pools and lanes: title, colour, more', () => {
    expect(toolbarControls(node('Shop'), ctx)).toEqual(['editText', 'color', 'more']);
    expect(toolbarControls(node('Sales'), ctx)).toEqual(['editText', 'color', 'more']);
  });

  it('connections: sequence flows get a line style; message flows and associations a fixed tag', () => {
    const seq = edgeId(SRC, 'Check stock', 'In stock?');
    const message = edgeId(SRC, 'Order placed', 'Check stock');
    const assoc = edgeId(SRC, 'Check stock', 'Inventory');
    const d = parseDiagram(SRC);
    expect(connectionKind(d, d.edges.find((e) => e.id === seq)!)).toBe('sequence');
    expect(connectionKind(d, d.edges.find((e) => e.id === message)!)).toBe('message');
    expect(connectionKind(d, d.edges.find((e) => e.id === assoc)!)).toBe('association');
    // A boundary event belongs to its task's pool: its flow to Notify delay stays a sequence flow.
    expect(connectionKind(d, d.edges.find((e) => e.from === 'Lost in transit')!)).toBe('sequence');
    expect(toolbarControls(edge(seq), ctx)).toEqual(['editText', 'color', 'bpmnLine', 'reverse', 'more']);
    expect(toolbarControls(edge(message), ctx)).toEqual(['editText', 'color', 'connectionKind', 'reverse', 'more']);
    expect(toolbarControls(edge(assoc), ctx)).toEqual(['editText', 'color', 'connectionKind', 'reverse', 'more']);
    expect(toolbarControls(edge(seq, message), ctx)).toEqual(['count', 'color', 'reverse', 'delete']);
  });

  it('several selected: only what they share', () => {
    expect(toolbarControls(node('Pack', 'Packed'), ctx)).toEqual(['count', 'bpmnType', 'gatewayKind', 'color', 'delete']);
    expect(toolbarControls(node('Pack', 'Done'), ctx)).toEqual(['count', 'bpmnType', 'color', 'delete']);
    expect(toolbarControls(node('Pack', 'Sales'), ctx)).toEqual(['count', 'color', 'delete']);
    expect(toolbarControls({ kind: 'label', ids: ['Pack'] }, ctx)).toEqual([]);
  });

  it('values, with defaults and Mixed', () => {
    expect(bpmnTypeValue(node('Check stock'), ctx)).toEqual({ value: 'activity', mixed: false });
    expect(bpmnTypeValue(node('Check stock', 'Pack'), ctx).mixed).toBe(true);
    expect(gatewayKindValue(node('In stock?'), ctx).value).toBe('exclusive');
    expect(gatewayKindValue(node('Pack'), ctx).value).toBe('parallel');
    expect(eventTriggerValue(node('Done'), ctx).value).toBe('none');
    expect(eventTriggerValue(node('Wait for stock'), ctx).value).toBe('timer');
    expect(eventTriggerValue(node('Done', 'Wait for stock'), ctx).mixed).toBe(true);
    expect(bpmnLineValue(edge(edgeId(SRC, 'Check stock', 'In stock?')), ctx).value).toBe('solid');
  });

  it('flow diagrams are unchanged', () => {
    const flow: ToolbarContext = { diagram: parseDiagram('A > B') };
    expect(toolbarControls(node('A'), flow)).toEqual(['editText', 'shape', 'icon', 'color', 'border', 'text', 'more']);
  });
});

describe('BPMN toolbar actions', () => {
  it('type changes drop the properties of the old type', () => {
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'activity' }, node('In stock?')), 'In stock?')).toBe('In stock?');
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'event' }, node('Pack')), 'Pack')).toBe('Pack [type: event]');
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'activity' }, node('Wait for stock')), 'Wait for stock')).toBe('Wait for stock');
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'gateway' }, node('Lost in transit')), 'Lost in transit')).toBe('Lost in transit [type: gateway]');
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'event' }, node('Check stock')), 'Check stock')).toBe('Check stock [type: event]');
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'data' }, node('Inventory')), 'Inventory')).toBe('Inventory [type: data]');
  });

  it("a task that stops being a task lets go of its boundary events", () => {
    const out = run(SRC, { type: 'bpmnType', value: 'store' }, node('Ship order'));
    expect(lineOf(out, 'Ship order [')).toBe('Ship order [type: store]');
    expect(lineOf(out, 'Lost in transit')).toBe('Lost in transit [type: event, event: error]');
    // Subprocess → activity keeps it (both are tasks).
    expect(lineOf(run(SRC, { type: 'bpmnType', value: 'activity' }, node('Ship order')), 'Lost in transit')).toContain('attached: Ship order');
  });

  it('several elements change type in one edit', () => {
    const out = run(SRC, { type: 'bpmnType', value: 'activity' }, node('Pack', 'Packed', 'Wait for stock'));
    expect(lineOf(out, 'Pack')).toBe('Pack');
    expect(lineOf(out, 'Packed')).toBe('Packed');
    expect(lineOf(out, 'Wait for stock')).toBe('Wait for stock');
  });

  it('keeps the code a BPMN diagram when the last typed element becomes an activity', () => {
    const src = 'P {\n  A [type: event]\n  B\n}\nA > B';
    expect(detectDiagramType(src)).toBe('bpmn');
    expect(lineOf(run(src, { type: 'bpmnType', value: 'activity' }, node('A')), 'A [')).toBe('A [type: activity]');
    const store = run(src, { type: 'bpmnType', value: 'store' }, node('A'));
    expect(lineOf(store, 'A [')).toBe('A [type: store]');
    expect(lineOf(store, 'B')).toBe('B [type: activity]');
    // With something else typed, activity is written as no property.
    const two = 'P {\n  A [type: event]\n  B [type: gateway]\n}\nA > B';
    expect(lineOf(run(two, { type: 'bpmnType', value: 'activity' }, node('A')), 'A')).toBe('A');
    expect(runToolbarAction('P {\n  A [type: event]\n}', { type: 'bpmnType', value: 'data' }, node('A'), ctxOf('P {\n  A [type: event]\n}'))).toMatchObject({ ok: false, reason: expect.stringMatching(/at least one/) });
  });

  it('gateway kind and event trigger: defaults are no property', () => {
    expect(lineOf(run(SRC, { type: 'set', key: 'gateway', value: 'exclusive' }, node('Pack')), 'Pack')).toBe('Pack [type: gateway]');
    expect(lineOf(run(SRC, { type: 'set', key: 'gateway', value: 'inclusive' }, node('In stock?')), 'In stock?')).toBe('In stock? [type: gateway, gateway: inclusive]');
    expect(lineOf(run(SRC, { type: 'set', key: 'event', value: 'none' }, node('Wait for stock')), 'Wait for stock')).toBe('Wait for stock [type: event]');
    expect(lineOf(run(SRC, { type: 'set', key: 'event', value: 'signal' }, node('Done')), 'Done')).toBe('Done [type: event, event: signal]');
    expect(runToolbarAction(SRC, { type: 'set', key: 'gateway', value: 'parallel' }, node('Done'), ctxOf(SRC))).toMatchObject({ ok: false });
  });

  it('attaches an event to a task, and detaches it', () => {
    expect(lineOf(run(SRC, { type: 'attach', task: 'Check stock' }, node('Wait for stock')), 'Wait for stock')).toBe('Wait for stock [type: event, event: timer, attached: Check stock]');
    expect(lineOf(run(SRC, { type: 'attach', task: null }, node('Lost in transit')), 'Lost in transit')).toBe('Lost in transit [type: event, event: error]');
    expect(runToolbarAction(SRC, { type: 'attach', task: 'In stock?' }, node('Wait for stock'), ctxOf(SRC))).toMatchObject({ ok: false });
    expect(runToolbarAction(SRC, { type: 'attach', task: 'Check stock' }, node('Pack'), ctxOf(SRC))).toMatchObject({ ok: false });
  });

  it('renames keep boundary events attached; colour as in flow diagrams', () => {
    const out = run(SRC, { type: 'editText', text: 'Ship' }, node('Ship order'));
    expect(lineOf(out, 'Lost in transit')).toContain('attached: Ship');
    expect(out).toContain('Pack > Ship, Send invoice');
    expect(lineOf(run(SRC, { type: 'set', key: 'color', value: 'green' }, node('Sales')), 'Sales')).toBe('Sales [color: green] {');
  });

  it('deleting a task drops its boundary events’ attached', () => {
    const out = run(SRC, { type: 'delete' }, node('Ship order'));
    expect(out).not.toMatch(/Ship order/);
    expect(lineOf(out, 'Lost in transit')).toBe('Lost in transit [type: event, event: error]');
  });

  it('pools and lanes: delete keeping contents or with them', () => {
    const kept = run(SRC, { type: 'delete', keepContents: true }, node('Warehouse'));
    expect(kept).not.toMatch(/Warehouse/);
    expect(kept).toContain('Ship order [type: subprocess]');
    const gone = run(SRC, { type: 'delete' }, node('Warehouse'));
    expect(gone).not.toMatch(/Ship order|Send invoice/);
  });

  it('connections: dashed, label, reverse, delete; message flows stay message flows', () => {
    const id = edgeId(SRC, 'Check stock', 'In stock?');
    const dashed = run(SRC, { type: 'line', value: 'dashed' }, edge(id));
    expect(dashed).toContain('Check stock --> In stock?');
    expect(run(dashed, { type: 'line', value: 'solid' }, edge(edgeId(dashed, 'Check stock', 'In stock?')))).toContain('Check stock > In stock?');
    expect(run(SRC, { type: 'editText', text: 'checked' }, edge(id))).toContain('Check stock > In stock?: checked');
    const reversed = run(SRC, { type: 'reverse' }, edge(edgeId(SRC, 'In stock?', 'Pack')));
    expect(reversed).toContain('Pack > In stock?: yes');
    expect(run(SRC, { type: 'delete' }, edge(edgeId(SRC, 'In stock?', 'Pack')))).not.toContain('In stock? > Pack');
    const message = edgeId(SRC, 'Packed', 'Receive goods');
    const coloured = run(SRC, { type: 'set', key: 'color', value: 'red' }, edge(message));
    const d = parseDiagram(coloured);
    const e = d.edges.find((x) => x.from === 'Packed' && x.to === 'Receive goods')!;
    expect(e.properties.color).toBe('red');
    expect(connectionKind(d, e)).toBe('message');
  });

  it('every type change on every element of the examples keeps the code valid', () => {
    for (const src of EXAMPLES) {
      const d = parseDiagram(src);
      const before = d.diagnostics.length;
      for (const n of d.nodes.values()) {
        if (n.kind !== 'node') continue;
        for (const t of BPMN_TYPES) {
          const result = runToolbarAction(src, { type: 'bpmnType', value: t }, node(n.id), ctxOf(src));
          if (!result.ok) {
            expect(result.reason).toBeUndefined(); // only "nothing to change" (already that type)
            continue;
          }
          const out = parseDiagram(result.source);
          expect(out.diagnostics.length, `${n.id} → ${t}`).toBeLessThanOrEqual(before);
          expect(detectDiagramType(result.source), `${n.id} → ${t}`).toBe('bpmn');
          const changed = out.nodes.get(n.id)!;
          if (t !== 'gateway') expect(changed.properties.gateway).toBeUndefined();
          if (t !== 'event') expect(changed.properties.event ?? changed.properties.attached).toBeUndefined();
          // No event is left attached to something that isn't a task.
          const layout = layoutBpmn(out);
          for (const el of layout.elements) if (el.attached) expect(['activity', 'subprocess']).toContain(layout.elements.find((h) => h.id === el.attached)!.type);
          for (const x of out.nodes.values()) {
            const host = x.properties.attached && out.nodes.get(x.properties.attached);
            if (host) expect(['activity', 'subprocess', undefined]).toContain(host.properties.type);
          }
        }
      }
    }
  });
});
