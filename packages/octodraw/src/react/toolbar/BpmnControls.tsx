import { useState, type ReactNode } from 'react';
import type { DiagramNode } from '../../dsl/types';
import { selectedNodes, type DiagramSelection, type ToolbarAction, type ToolbarContext, type ToolbarControl } from './actions';
import {
  attachableTasks,
  bandKind,
  BPMN_TYPES,
  bpmnLineValue,
  bpmnTypeOf,
  bpmnTypeValue,
  connectionKindValue,
  EVENT_TRIGGERS,
  eventTriggerValue,
  GATEWAY_KINDS,
  gatewayKindValue,
  type BpmnType,
  type EventTrigger,
  type GatewayKind,
} from './bpmn';
import { DescriptionGlyph, LineSample, LinkGlyph, TrashGlyph, UngroupGlyph } from './glyphs';
import { CommandRow, Menu, MenuLabel, MenuSeparator, OptionList } from './OptionList';

// The BPMN parts of the element toolbar: the Type, Gateway kind, Event trigger
// and Line buttons with their menus, and the More menu for BPMN elements, pools,
// lanes and connections. ElementToolbar hands over the controls it doesn't know.

export const BPMN_TYPE_LABELS: Record<BpmnType, string> = { activity: 'Activity', event: 'Event', gateway: 'Gateway', subprocess: 'Subprocess', data: 'Data object', store: 'Data store' };
export const GATEWAY_LABELS: Record<GatewayKind, string> = { exclusive: 'Exclusive', parallel: 'Parallel', inclusive: 'Inclusive', event: 'Event-based' };
export const TRIGGER_LABELS: Record<EventTrigger, string> = { none: 'None', message: 'Message', timer: 'Timer', error: 'Error', signal: 'Signal' };

/** What ElementToolbar lends the BPMN controls. */
export interface BpmnToolbarUi {
  selection: DiagramSelection;
  ctx: ToolbarContext;
  menuButton: (id: ToolbarControl, label: string, content: ReactNode, title?: string) => ReactNode;
  act: (action: ToolbarAction, keepOpen?: boolean) => boolean;
  set: (key: string, value: string | null, keepOpen?: boolean) => boolean;
  onClose: () => void;
  mixed: ReactNode;
}

/** A toolbar button for a BPMN control, or undefined when the control isn't a BPMN one. */
export function bpmnControl(control: ToolbarControl, ui: BpmnToolbarUi): ReactNode | undefined {
  const { selection, ctx, menuButton, mixed } = ui;
  switch (control) {
    case 'bpmnType': {
      const v = bpmnTypeValue(selection, ctx);
      const t = v.value as BpmnType | undefined;
      return menuButton('bpmnType', v.mixed ? 'Type, mixed' : 'Type', v.mixed || !t ? mixed : <><BpmnTypeGlyph type={t} />{BPMN_TYPE_LABELS[t]}</>);
    }
    case 'gatewayKind': {
      const v = gatewayKindValue(selection, ctx);
      const k = v.value as GatewayKind | undefined;
      return menuButton('gatewayKind', 'Gateway kind', v.mixed || !k ? mixed : <><GatewayGlyph kind={k} />{GATEWAY_LABELS[k]}</>);
    }
    case 'eventTrigger': {
      const v = eventTriggerValue(selection, ctx);
      const k = v.value as EventTrigger | undefined;
      return menuButton('eventTrigger', 'Event trigger', v.mixed || !k ? mixed : <><TriggerGlyph trigger={k} />{TRIGGER_LABELS[k]}</>);
    }
    case 'bpmnLine': {
      const v = bpmnLineValue(selection, ctx);
      return menuButton('bpmnLine', 'Line', v.mixed ? mixed : <LineSample style={v.value === 'dashed' ? 'dashed' : 'solid'} width={1.5} />, 'Line style');
    }
    case 'connectionKind': {
      const kind = connectionKindValue(selection, ctx);
      const message = kind === 'message';
      return (
        <span key="kind" className="od-etb-tag" title={message ? 'Connections between pools are message flows: always dashed' : 'Lines to data objects and stores are associations: always dotted'}>
          <LineSample style={message ? 'dashed' : 'dotted'} width={1.5} />
          {message ? 'Message flow' : 'Association'}
        </span>
      );
    }
    default:
      return undefined;
  }
}

/** The menu for a BPMN control, or undefined. */
export function bpmnMenu(id: string, ui: BpmnToolbarUi): ReactNode | undefined {
  const { selection, ctx, act, set, onClose } = ui;
  switch (id) {
    case 'bpmnType': {
      const v = bpmnTypeValue(selection, ctx);
      return (
        <Menu label="Type" onClose={onClose} width={208}>
          <OptionList options={BPMN_TYPES.map((t) => ({ value: t, label: BPMN_TYPE_LABELS[t], preview: <BpmnTypeGlyph type={t} /> }))} value={v.mixed ? undefined : v.value} onPick={(t) => act({ type: 'bpmnType', value: t })} />
        </Menu>
      );
    }
    case 'gatewayKind': {
      const v = gatewayKindValue(selection, ctx);
      return (
        <Menu label="Gateway kind" onClose={onClose} width={200}>
          <OptionList options={GATEWAY_KINDS.map((k) => ({ value: k, label: GATEWAY_LABELS[k], preview: <GatewayGlyph kind={k} /> }))} value={v.mixed ? undefined : v.value} onPick={(k) => set('gateway', k)} />
        </Menu>
      );
    }
    case 'eventTrigger': {
      const v = eventTriggerValue(selection, ctx);
      return (
        <Menu label="Event trigger" onClose={onClose} width={184}>
          <OptionList options={EVENT_TRIGGERS.map((k) => ({ value: k, label: TRIGGER_LABELS[k], preview: <TriggerGlyph trigger={k} /> }))} value={v.mixed ? undefined : v.value} onPick={(k) => set('event', k)} />
        </Menu>
      );
    }
    case 'bpmnLine': {
      const v = bpmnLineValue(selection, ctx);
      return (
        <Menu label="Line" onClose={onClose} width={220}>
          <OptionList
            tall
            options={[
              { value: 'solid', label: 'Solid', preview: <LineSample style="solid" width={1.5} />, hint: 'sequence flow' },
              { value: 'dashed', label: 'Dashed', preview: <LineSample style="dashed" width={1.5} /> },
            ]}
            value={v.mixed ? undefined : v.value}
            onPick={(value) => act({ type: 'line', value })}
          />
        </Menu>
      );
    }
    default:
      return undefined;
  }
}

/** A one-line field inside a menu (ElementToolbar's FieldEditor). */
export type FieldEditorComponent = (props: { label: string; placeholder: string; initial: string; onSave: (value: string) => boolean; onBack: () => void }) => ReactNode;

/** The More (⋯) menu for BPMN: boundary event, description, link, delete; pools and lanes: delete with or without contents. */
export function BpmnMoreMenu({ ui, FieldEditor }: { ui: BpmnToolbarUi; FieldEditor: FieldEditorComponent }) {
  const { selection, ctx, act, set } = ui;
  const [field, setField] = useState<'description' | 'link' | 'attach' | null>(null);
  if (selection.kind === 'edge') {
    return <CommandRow icon={<TrashGlyph size={16} />} label={selection.ids.length > 1 ? 'Delete connections' : 'Delete connection'} hint="⌫" danger onClick={() => act({ type: 'delete' })} />;
  }
  const single: DiagramNode | undefined = selectedNodes(selection, ctx)[0];
  if (!single) return null;
  const band = bandKind(ctx.diagram, single.id);
  if (band) {
    const what = band === 'pool' ? 'pool' : 'lane';
    return (
      <>
        <CommandRow icon={<UngroupGlyph />} label={`Delete ${what}, keep contents`} onClick={() => act({ type: 'delete', keepContents: true })} />
        <CommandRow icon={<TrashGlyph size={16} />} label={`Delete ${what} and contents`} hint="⌫" danger onClick={() => act({ type: 'delete' })} />
      </>
    );
  }
  if (field === 'attach') {
    const tasks = attachableTasks(ctx).filter((t) => t !== single.id);
    const current = single.properties.attached;
    return (
      <>
        <MenuLabel>Sits on the edge of</MenuLabel>
        <OptionList
          options={[{ value: '', label: 'No task (in the flow)' }, ...tasks.map((t) => ({ value: t, label: t, preview: <BpmnTypeGlyph type={bpmnTypeOf(ctx.diagram.nodes.get(t)!)} /> }))]}
          value={current && tasks.includes(current) ? current : ''}
          onPick={(task) => act({ type: 'attach', task: task || null })}
        />
      </>
    );
  }
  if (field) {
    return (
      <FieldEditor
        label={field === 'link' ? 'Link' : 'Description'}
        placeholder={field === 'link' ? 'https://…' : 'A line under the name'}
        initial={single.properties[field] ?? ''}
        onSave={(value) => set(field, value.trim() || null)}
        onBack={() => setField(null)}
      />
    );
  }
  const event = bpmnTypeOf(single) === 'event';
  return (
    <>
      {event && <CommandRow icon={<BoundaryGlyph />} label="Attach to task…" hint={single.properties.attached ?? undefined} onClick={() => setField('attach')} />}
      <CommandRow icon={<DescriptionGlyph />} label="Description" hint={single.properties.description ? 'Edit' : undefined} onClick={() => setField('description')} />
      <CommandRow icon={<LinkGlyph />} label="Link" hint={single.properties.link ? 'Edit' : undefined} onClick={() => setField('link')} />
      <MenuSeparator />
      <CommandRow icon={<TrashGlyph size={16} />} label="Delete" hint="⌫" danger onClick={() => act({ type: 'delete' })} />
    </>
  );
}

// --- Glyphs (20px, currentColor) ----------------------------------------------------

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/** BPMN element outlines: rounded task, circle event, diamond gateway, task with ⊞, folded page, cylinder. */
export function BpmnTypeGlyph({ type }: { type: BpmnType }) {
  switch (type) {
    case 'event':
      return <Svg><circle cx="12" cy="12" r="8" {...S} /></Svg>;
    case 'gateway':
      return <Svg><path d="M12 3 21 12 12 21 3 12z" {...S} /></Svg>;
    case 'subprocess':
      return (
        <Svg>
          <rect x="2" y="5" width="20" height="14" rx="3" {...S} />
          <rect x="9.5" y="12.5" width="5" height="5" rx="0.8" {...S} strokeWidth={1.1} />
          <path d="M12 13.5v3M10.5 15h3" {...S} strokeWidth={1.1} />
        </Svg>
      );
    case 'data':
      return <Svg><path d="M6 3h8l4 4v14H6z M14 3v4h4" {...S} /></Svg>;
    case 'store':
      return (
        <Svg>
          <ellipse cx="12" cy="6" rx="8" ry="2.6" {...S} />
          <path d="M4 6v12c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V6" {...S} />
        </Svg>
      );
    default:
      return <Svg><rect x="2" y="5" width="20" height="14" rx="3.5" {...S} /></Svg>;
  }
}

/** A gateway diamond with its marker: X exclusive, + parallel, O inclusive, ringed pentagon event-based. */
export function GatewayGlyph({ kind }: { kind: GatewayKind }) {
  const marker =
    kind === 'parallel' ? <path d="M12 8v8M8 12h8" {...S} strokeWidth={1.8} />
    : kind === 'inclusive' ? <circle cx="12" cy="12" r="3.6" {...S} strokeWidth={1.6} />
    : kind === 'event' ? <><circle cx="12" cy="12" r="4.4" {...S} strokeWidth={1} /><path d="M12 9.6l2.3 1.7-.9 2.7h-2.8l-.9-2.7z" {...S} strokeWidth={1} /></>
    : <path d="M9.4 9.4l5.2 5.2M14.6 9.4l-5.2 5.2" {...S} strokeWidth={1.7} />;
  return (
    <Svg>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" {...S} />
      {marker}
    </Svg>
  );
}

/** An event circle with its trigger: envelope, clock, lightning, triangle (none: empty). */
export function TriggerGlyph({ trigger }: { trigger: EventTrigger }) {
  const marker =
    trigger === 'message' ? <><rect x="7.5" y="9" width="9" height="6.5" rx="0.6" {...S} strokeWidth={1.2} /><path d="M7.5 9l4.5 3.6L16.5 9" {...S} strokeWidth={1.2} /></>
    : trigger === 'timer' ? <><circle cx="12" cy="12" r="4.6" {...S} strokeWidth={1.2} /><path d="M12 9.4V12l1.8 1.2" {...S} strokeWidth={1.2} /></>
    : trigger === 'error' ? <path d="M8.5 15.5l2-6.5 2.6 4 2.4-4.5-1.6 6.6-2.6-4z" {...S} strokeWidth={1.2} />
    : trigger === 'signal' ? <path d="M12 7.8l4.4 7.4H7.6z" {...S} strokeWidth={1.2} />
    : null;
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" {...S} />
      {marker}
    </Svg>
  );
}

/** A task with an event on its bottom edge. */
const BoundaryGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="3" width="20" height="13" rx="3" {...S} strokeWidth={1.75} />
    <circle cx="16" cy="16" r="4" {...S} strokeWidth={1.75} />
  </svg>
);
