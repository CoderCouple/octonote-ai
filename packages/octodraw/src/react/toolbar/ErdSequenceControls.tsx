import { useState, type ReactNode } from 'react';
import type { ErdConnector, ErdDiagram } from '../../dsl/erd';
import type { MessageDirection, MessageLine } from '../../dsl/edit-sequence';
import type { BlockKind, SequenceDiagram } from '../../dsl/sequence';
import { resolveIcon, type IconSet } from '../../icons/resolve';
import type { IconResolver } from '../../icons/types';
import type { Theme } from '../../theme/tokens';
import { Icon } from '../DiagramSvg';
import { FieldEditor, type ToolbarDelegate, type ToolbarDelegateApi } from '../ElementToolbar';
import type { DiagramSelection, ToolbarValue } from './actions';
import { ColorGrid, swatchColor } from './ColorGrid';
import {
  CARDINALITIES,
  ERD_COLUMN_TYPES,
  ERD_KEY_OPTIONS,
  erdCardinalityValue,
  erdColumnKeyValue,
  erdColumnTypeValue,
  erdColumnUses,
  erdControls,
  erdEditRenames,
  erdPropertyValue,
  erdTables,
  erdTarget,
  type ErdToolbarAction,
} from './erd';
import { IconGlyph, LineSample, LinkGlyph, MoreGlyph, TrashGlyph } from './glyphs';
import { IconPicker } from './IconPicker';
import { CommandRow, Menu, MenuSeparator, OptionList } from './OptionList';
import {
  blockKindOptions,
  blockKindValue,
  directionOptions,
  messageDirectionValue,
  messageLineValue,
  messagesDeletedWith,
  selectedActivations,
  selectedBlocks,
  selectedMessages,
  selectedParticipants,
  sequenceControls,
  sequenceEditRenames,
  sequencePropertyValue,
  sequenceTarget,
  type SequenceToolbarAction,
} from './sequence';

// Element toolbar controls for ERD and sequence diagrams, plugged into
// `ElementToolbar` as a delegate: the bar, menus and inline editor are shared,
// the controls and what they change are these.

interface Common {
  selection: DiagramSelection;
  theme: Theme;
  icons?: IconResolver;
  iconSet: IconSet;
}

/** The ERD toolbar: tables (name, icon, colour, key columns) and relationships (cardinality, colour, label). */
export function erdToolbarDelegate(options: Common & {
  diagram: ErdDiagram;
  /** Runs an action; false when it was refused. */
  run: (action: ErdToolbarAction) => boolean;
  /** "Key columns only" for the selected tables: view state, not code. */
  keyColumns: { on: boolean; toggle: () => void };
}): ToolbarDelegate | null {
  const { selection, diagram, theme, run } = options;
  const target = erdTarget(selection, diagram);
  if (!target) return null;
  const isRel = target === 'relationship' || target === 'relationships';
  const crows = diagram.settings.notation === 'crows-feet';
  const icon = erdPropertyValue(selection, diagram, 'icon');
  const color = erdPropertyValue(selection, diagram, 'color');
  const cardinality = erdCardinalityValue(selection, diagram);
  const count = selection.ids.length;
  const act = (api: ToolbarDelegateApi, action: ErdToolbarAction, keepOpen = false) => {
    const done = run(action);
    if (done && !keepOpen) api.close();
    return done;
  };
  const tables = erdTables(selection, diagram);
  const isCol = target === 'column' || target === 'columns';
  const columnType = erdColumnTypeValue(selection, diagram);
  const uses = isCol ? erdColumnUses(selection, diagram) : 0;
  const labels: Record<string, string> = { table: 'Table', tables: `${count} tables`, relationship: 'Relationship', relationships: `${count} relationships`, column: 'Column', columns: `${count} columns` };
  return {
    controls: erdControls(selection, diagram),
    label: labels[target]!,
    editHint: isRel ? "Sets the relationship's label" : isCol ? 'Renames it and every relationship that uses it' : erdEditRenames(selection, diagram) ? 'Renames it everywhere in the code' : 'Sets its label',
    render: (control, api) => {
      switch (control) {
        case 'count':
          return <span key="count" className="od-etb-count">{count} selected</span>;
        case 'editText':
          return api.button('edit', isRel ? 'Edit label' : 'Edit name', isRel ? 'Edit label' : 'Edit name', api.onStartEdit, { className: 'od-etb-edit', title: `${isRel ? 'Edit label' : 'Edit name'} (Enter)` });
        case 'columnType':
          return api.menuButton('columnType', 'Type', columnType.mixed ? api.mixedText : <span className="od-etb-mono">{columnType.value ?? 'No type'}</span>, 'Column type');
        case 'columnKeys': {
          const on = ERD_KEY_OPTIONS.filter((k) => erdColumnKeyValue(selection, diagram, k.key).value === 'on').map((k) => k.short);
          return api.menuButton('columnKeys', 'Key', on.length ? <span className="od-etb-mono">{on.join(' ')}</span> : <span className="od-etb-muted">Key</span>, 'Primary key, foreign key, unique, nullable');
        }
        case 'icon':
          return iconButton(api, icon, options);
        case 'color':
          return api.menuButton('color', 'Colour', colorDot(api, color, theme, isRel ? theme.color.edge : theme.node.stroke));
        case 'keyColumns':
          return api.button(
            'keyColumns',
            'Key columns only',
            <>
              Key columns
              <span className="od-etb-switch" data-on={options.keyColumns.on || undefined} aria-hidden="true" />
            </>,
            options.keyColumns.toggle,
            { title: options.keyColumns.on ? 'Show every column' : 'Show only key columns (pk, fk)' },
          );
        case 'cardinality': {
          const current = CARDINALITIES.find((c) => c.value === cardinality.value);
          return api.menuButton('cardinality', 'Cardinality', cardinality.mixed ? api.mixedText : <><CardinalitySample value={(cardinality.value as ErdConnector) ?? '-'} crows={crows} />{current?.label}</>);
        }
        case 'more':
          return api.button('more', 'More', <MoreGlyph />, () => api.toggle('more'), { menu: true });
        case 'delete':
          return api.button('delete', `Delete ${count} ${isRel ? 'relationships' : isCol ? 'columns' : 'tables'}`, <TrashGlyph />, () => act(api, { type: 'delete' }), { title: uses ? `Used by ${uses} relationship${uses > 1 ? 's' : ''}` : 'Delete (⌫)' });
        default:
          return null;
      }
    },
    menu: (id, api) => {
      const onClose = () => api.close();
      switch (id) {
        case 'columnType':
          return (
            <Menu label="Type" onClose={onClose} width={220}>
              <ColumnTypeMenu value={columnType} onPick={(value) => act(api, { type: 'columnType', value })} />
            </Menu>
          );
        case 'columnKeys':
          return (
            <Menu label="Key" onClose={onClose} width={236}>
              {ERD_KEY_OPTIONS.map((k) => {
                const value = erdColumnKeyValue(selection, diagram, k.key);
                return <CommandRow key={k.key} icon={<span className="od-etb-keytag">{k.short}</span>} label={k.label} checked={value.value === 'on'} onClick={() => act(api, { type: 'columnKey', key: k.key, on: value.value !== 'on' }, true)} />;
              })}
            </Menu>
          );
        case 'icon':
          return (
            <Menu label="Icon" onClose={onClose} width={400} className="od-etb-pop-flush">
              <IconPicker theme={theme} icons={options.icons} iconSet={options.iconSet} value={icon.value} mixed={icon.mixed} onPick={(name) => act(api, { type: 'set', key: 'icon', value: name })} />
            </Menu>
          );
        case 'color':
          return (
            <Menu label="Colour" onClose={onClose} width={232} columns={6}>
              <ColorGrid theme={theme} value={color.value} mixed={color.mixed} onPick={(value) => act(api, { type: 'set', key: 'color', value })} />
            </Menu>
          );
        case 'cardinality':
          return (
            <Menu label="Cardinality" onClose={onClose} width={236}>
              <OptionList tall options={CARDINALITIES.map((c) => ({ value: c.value, label: c.label, preview: <CardinalitySample value={c.value} crows={crows} />, hint: c.value }))} value={cardinality.mixed ? undefined : cardinality.value} onPick={(value) => act(api, { type: 'cardinality', value })} />
            </Menu>
          );
        case 'more':
          return (
            <Menu label="More" onClose={onClose} width={248}>
              {isRel ? (
                <CommandRow icon={<TrashGlyph size={16} />} label="Delete relationship" hint="⌫" danger onClick={() => act(api, { type: 'delete' })} />
              ) : isCol ? (
                <>
                  <CommandRow icon={<PlusGlyph />} label="Add column below" onClick={() => act(api, { type: 'addColumn' })} />
                  <MenuSeparator />
                  <CommandRow
                    icon={<TrashGlyph size={16} />}
                    label="Delete column"
                    hint={uses ? `Used by ${uses}` : '⌫'}
                    danger
                    onClick={() => {
                      // Close even when refused, so the reason above the bar is visible.
                      act(api, { type: 'delete' });
                      api.close();
                    }}
                  />
                </>
              ) : (
                <LinkAndDelete
                  link={tables[0]?.properties.link}
                  deleteLabel="Delete table"
                  onLink={(value) => act(api, { type: 'set', key: 'link', value })}
                  onDelete={() => act(api, { type: 'delete' })}
                  extra={<CommandRow icon={<PlusGlyph />} label="Add column" onClick={() => act(api, { type: 'addColumn' })} />}
                />
              )}
            </Menu>
          );
        default:
          return null;
      }
    },
  };
}

/** The sequence toolbar: participants (name, icon, colour) and messages (label, colour, line, direction). */
export function sequenceToolbarDelegate(options: Common & {
  diagram: SequenceDiagram;
  run: (action: SequenceToolbarAction) => boolean;
  /** Participant names in column order, so direction arrows point the way they are drawn. */
  columns?: readonly string[];
}): ToolbarDelegate | null {
  const { selection, diagram, theme, run } = options;
  const target = sequenceTarget(selection, diagram);
  if (!target) return null;
  const isMsg = target === 'message' || target === 'messages';
  const isBlock = target === 'block' || target === 'blocks';
  const isBar = target === 'activation' || target === 'activations';
  const labelled = isMsg || isBlock;
  const icon = sequencePropertyValue(selection, diagram, 'icon');
  const color = sequencePropertyValue(selection, diagram, 'color');
  const line = messageLineValue(selection, diagram);
  const direction = messageDirectionValue(selection, diagram);
  const kind = blockKindValue(selection, diagram);
  const count = selection.ids.length;
  const messages = selectedMessages(selection, diagram);
  const message = messages.length === 1 ? messages[0]! : null;
  const participant = selectedParticipants(selection, diagram)[0];
  const block = selectedBlocks(selection, diagram)[0];
  const bar = selectedActivations(selection, diagram)[0];
  const doomed = messagesDeletedWith(selection, diagram);
  const act = (api: ToolbarDelegateApi, action: SequenceToolbarAction, keepOpen = false) => {
    const done = run(action);
    if (done && !keepOpen) api.close();
    return done;
  };
  // Arrows point as drawn: a message written right-to-left flips them.
  const flip = !!message && !!options.columns && options.columns.indexOf(message.from) > options.columns.indexOf(message.to);
  const withMessages = (base: string) => (doomed ? `${base} with ${doomed} message${doomed > 1 ? 's' : ''}` : base);
  const name = (n: string) => diagram.participants.get(n)?.label ?? n;
  const labels: Record<string, string> = {
    participant: 'Participant',
    participants: `${count} participants`,
    message: 'Message',
    messages: `${count} messages`,
    block: 'Block',
    blocks: `${count} blocks`,
    activation: 'Activation',
    activations: `${count} activations`,
  };
  return {
    controls: sequenceControls(selection, diagram),
    label: labels[target]!,
    editHint: isMsg ? "Sets the message's label" : isBlock ? "Sets the block's label" : sequenceEditRenames(selection, diagram) ? 'Renames it everywhere in the code' : 'Sets its label',
    render: (control, api) => {
      switch (control) {
        case 'count':
          return <span key="count" className="od-etb-count">{count} selected</span>;
        case 'tag':
          return (
            <span key="tag" className="od-etb-tag">
              {bar ? `${name(bar.participant)} active` : 'Activation'}
            </span>
          );
        case 'editText':
          return api.button('edit', labelled ? 'Edit label' : 'Edit name', labelled ? 'Edit label' : 'Edit name', api.onStartEdit, { className: 'od-etb-edit', title: `${labelled ? 'Edit label' : 'Edit name'} (Enter)` });
        case 'blockKind':
          return api.menuButton('blockKind', 'Kind', kind.mixed ? api.mixedText : <span className="od-etb-t">{kind.value}</span>, 'Loop, alt, opt, par or break');
        case 'icon':
          return iconButton(api, icon, options);
        case 'color':
          return api.menuButton('color', 'Colour', colorDot(api, color, theme, isMsg ? theme.color.edge : theme.node.stroke));
        case 'line':
          return api.menuButton('line', 'Line', line.mixed ? api.mixedText : <><LineSample style={line.value === 'return' ? 'dashed' : 'solid'} />{line.value === 'return' ? 'Return' : 'Call'}</>, 'Call or return');
        case 'direction':
          return api.menuButton('direction', 'Direction', direction.mixed ? api.mixedText : direction.value ? <DirectionGlyph value={direction.value as MessageDirection} flip={flip} /> : <span className="od-etb-muted">None</span>);
        case 'more':
          return api.button('more', 'More', <MoreGlyph />, () => api.toggle('more'), { menu: true });
        case 'delete':
          return api.button('delete', isMsg ? `Delete ${count} messages` : isBlock ? withMessages(`Delete ${count} blocks`) : isBar ? `Delete ${count} activations` : withMessages(`Delete ${count} participants`), <TrashGlyph />, () => act(api, { type: 'delete' }), { title: 'Delete (⌫)' });
        default:
          return null;
      }
    },
    menu: (id, api) => {
      const onClose = () => api.close();
      switch (id) {
        case 'icon':
          return (
            <Menu label="Icon" onClose={onClose} width={400} className="od-etb-pop-flush">
              <IconPicker theme={theme} icons={options.icons} iconSet={options.iconSet} value={icon.value} mixed={icon.mixed} onPick={(name) => act(api, { type: 'set', key: 'icon', value: name })} />
            </Menu>
          );
        case 'color':
          return (
            <Menu label="Colour" onClose={onClose} width={232} columns={6}>
              <ColorGrid theme={theme} value={color.value} mixed={color.mixed} onPick={(value) => act(api, { type: 'set', key: 'color', value })} />
            </Menu>
          );
        case 'line':
          return (
            <Menu label="Line" onClose={onClose} width={208}>
              <OptionList<MessageLine>
                tall
                options={[
                  { value: 'call', label: 'Call', preview: <LineSample style="solid" />, hint: '>' },
                  { value: 'return', label: 'Return', preview: <LineSample style="dashed" />, hint: '-->' },
                ]}
                value={line.mixed ? undefined : line.value}
                onPick={(value) => act(api, { type: 'line', value })}
              />
            </Menu>
          );
        case 'direction':
          return (
            <Menu label="Direction" onClose={onClose} width={248}>
              <OptionList<MessageDirection> options={directionOptions(message, diagram).map((o) => ({ ...o, preview: <DirectionGlyph value={o.value} flip={flip} /> }))} value={direction.mixed ? undefined : direction.value} onPick={(value) => act(api, { type: 'direction', value })} />
            </Menu>
          );
        case 'blockKind':
          return block ? (
            <Menu label="Kind" onClose={onClose} width={260}>
              <OptionList<BlockKind> options={blockKindOptions(block).map((o) => ({ value: o.value, label: `${o.value} · ${o.label}`, hint: o.disabled }))} value={kind.mixed ? undefined : kind.value} onPick={(value) => act(api, { type: 'blockKind', value })} />
            </Menu>
          ) : null;
        case 'more':
          return (
            <Menu label="More" onClose={onClose} width={280}>
              {isMsg ? (
                <CommandRow icon={<TrashGlyph size={16} />} label="Delete message" hint="⌫" danger onClick={() => act(api, { type: 'delete' })} />
              ) : isBar ? (
                <CommandRow icon={<TrashGlyph size={16} />} label="Delete activation" hint="⌫" danger onClick={() => act(api, { type: 'delete' })} />
              ) : isBlock ? (
                <>
                  <CommandRow icon={<UnwrapGlyph />} label="Delete block, keep messages" onClick={() => act(api, { type: 'unwrap' })} />
                  <MenuSeparator />
                  <CommandRow icon={<TrashGlyph size={16} />} label={withMessages('Delete block')} hint="⌫" danger onClick={() => act(api, { type: 'delete' })} />
                </>
              ) : (
                <LinkAndDelete link={participant?.properties.link} deleteLabel={withMessages('Delete')} onLink={(value) => act(api, { type: 'set', key: 'link', value })} onDelete={() => act(api, { type: 'delete' })} />
              )}
            </Menu>
          );
        default:
          return null;
      }
    },
  };
}

function iconButton(api: ToolbarDelegateApi, value: ToolbarValue, { theme, icons, iconSet }: Common): ReactNode {
  const resolved = value.value ? resolveIcon(value.value, icons, iconSet) : undefined;
  return api.menuButton(
    'icon',
    value.mixed ? 'Icon, mixed' : 'Icon',
    value.mixed ? (
      api.mixedText
    ) : value.value ? (
      <svg width="18" height="18" aria-hidden="true">
        <Icon name={value.value} resolved={resolved} x={0} y={0} size={18} tint={resolved?.tint ?? theme.color.text} theme={theme} />
      </svg>
    ) : (
      <IconGlyph />
    ),
  );
}

function colorDot(api: ToolbarDelegateApi, value: ToolbarValue, theme: Theme, fallback: string): ReactNode {
  return value.mixed ? api.mixedText : <span className="od-etb-dot" style={{ background: swatchColor(theme, value.value) ?? fallback }} />;
}

/** ⋯ More for a table or participant: Link (edited in place) and Delete. */
function LinkAndDelete({ link, deleteLabel, onLink, onDelete, extra }: { link: string | undefined; deleteLabel: string; onLink: (value: string | null) => boolean; onDelete: () => void; extra?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <FieldEditor label="Link" placeholder="https://…" initial={link ?? ''} onSave={(value) => onLink(value.trim() || null)} onBack={() => setEditing(false)} />;
  return (
    <>
      {extra}
      <CommandRow icon={<LinkGlyph />} label="Link" hint={link ? 'Edit' : undefined} onClick={() => setEditing(true)} />
      <MenuSeparator />
      <CommandRow icon={<TrashGlyph size={16} />} label={deleteLabel} hint="⌫" danger onClick={onDelete} />
    </>
  );
}

/** Type ▾ for columns: the common types, the current one if it isn't common, and Other… (free text). */
function ColumnTypeMenu({ value, onPick }: { value: ToolbarValue; onPick: (value: string) => boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <FieldEditor label="Column type" placeholder="varchar(255)" initial={value.value ?? ''} onSave={(text) => onPick(text)} onBack={() => setEditing(false)} />;
  const types: string[] = [...ERD_COLUMN_TYPES];
  if (value.value && !types.includes(value.value)) types.unshift(value.value);
  return (
    <>
      <OptionList options={types.map((t) => ({ value: t, label: t }))} value={value.mixed ? undefined : value.value} onPick={onPick} />
      <MenuSeparator />
      <CommandRow icon={<PencilGlyph />} label="Other…" onClick={() => setEditing(true)} />
    </>
  );
}

const UnwrapGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeDasharray="2 2.5" />
    <path d="M8 12h8" />
  </svg>
);

const PlusGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const PencilGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
  </svg>
);

/** A line with one/many marks at each end, in the diagram's notation (crow's foot, or Chen's 1 / N). */
export function CardinalitySample({ value, crows }: { value: ErdConnector; crows: boolean }) {
  const c = CARDINALITIES.find((x) => x.value === value) ?? CARDINALITIES[0]!;
  const end = (x: number, dir: 1 | -1, many: boolean) => {
    if (!crows) return <text x={x + dir * 5} y={6.5} fontSize={8} fontWeight={700} textAnchor="middle" fill="currentColor" stroke="none">{many ? 'N' : '1'}</text>;
    if (!many) return <path d={`M${x + dir * 3},4 V14 M${x + dir * 6},4 V14`} />;
    return <path d={`M${x + dir * 7},9 L${x},4 M${x + dir * 7},9 L${x},14 M${x + dir * 7},9 L${x},9 M${x + dir * 9},4 V14`} />;
  };
  return (
    <svg width="40" height="18" viewBox="0 0 40 18" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
      <path d="M2,9 H38" />
      {end(2, 1, c.start === 'many')}
      {end(38, -1, c.end === 'many')}
    </svg>
  );
}

function DirectionGlyph({ value, flip = false }: { value: MessageDirection; flip?: boolean }) {
  const right = flip ? 'M7 6l-5 5 5 5' : 'M17 6l5 5-5 5';
  const left = flip ? 'M17 6l5 5-5 5' : 'M7 6l-5 5 5 5';
  return (
    <svg width="20" height="18" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 11h20" />
      {value !== 'back' && <path d={right} />}
      {value !== 'forward' && <path d={left} />}
    </svg>
  );
}
