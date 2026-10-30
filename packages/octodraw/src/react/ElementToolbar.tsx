import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import type { Theme } from '../theme/tokens';
import { Icon } from './DiagramSvg';
import {
  editRenames,
  headValue,
  iconSizeValue,
  lineValue,
  propertyValue,
  selectedEdges,
  selectedNodes,
  selectionTarget,
  sizeName,
  SHAPES,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  textSizeValue,
  toolbarControls,
  TYPEFACES,
  widthName,
  type ArrowHeadValue,
  type DiagramSelection,
  type LineValue,
  type ToolbarAction,
  type ToolbarContext,
  type ToolbarControl,
} from './toolbar/actions';
import { ColorGrid, swatchColor } from './toolbar/ColorGrid';
import {
  AlignGlyph,
  BorderGlyph,
  Caret,
  CollapsedGlyph,
  DescriptionGlyph,
  HeadSample,
  IconGlyph,
  LineGlyph,
  LineSample,
  LinkGlyph,
  MoreGlyph,
  OpenGlyph,
  ReverseGlyph,
  ShapeGlyph,
  ShapeSample,
  TrashGlyph,
  UngroupGlyph,
} from './toolbar/glyphs';
import { IconPicker } from './toolbar/IconPicker';
import { CommandRow, Menu, MenuLabel, MenuSeparator, OptionList, Segmented, type Option } from './toolbar/OptionList';
import { SizeStepper } from './toolbar/SizeStepper';

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ToolbarEditing {
  /** Where the label is on screen (container coordinates). */
  rect: ScreenRect;
  fontSize: number;
  fontFamily?: string;
  align: 'left' | 'center' | 'right';
  initial: string;
}

export interface ElementToolbarProps {
  selection: DiagramSelection;
  ctx: ToolbarContext;
  theme: Theme;
  icons?: IconResolver;
  iconSet: IconSet;
  /** The diagram's root element: the bar and its menus are placed inside it. */
  container: RefObject<HTMLDivElement | null>;
  /** Screen box of the selection (container coordinates); the bar moves so it never covers it. */
  avoid: ScreenRect | null;
  /** Runs an action; false when it was refused (true when it applied or there was nothing to change). */
  onAction: (action: ToolbarAction) => boolean;
  onOpenGroup?: (id: string) => void;
  canOpenGroup?: (id: string) => boolean;
  editing: ToolbarEditing | null;
  onStartEdit: () => void;
  /** Saves the edited text; false keeps the field open (e.g. the name is taken). */
  onCommitEdit: (text: string) => boolean;
  onCancelEdit: () => void;
  /** A one-line message above the bar (why an edit was refused). */
  notice: string | null;
}

type Pop = ToolbarControl | 'align' | 'textSize' | 'typeface';
type Placement = { at: 'bottom' } | { at: 'lifted'; bottom: number } | { at: 'top' };

const GAP = 20;
const HEADER = 56;

const SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' } as const;
const WIDTH_OPTIONS: Option<'thin' | 'medium' | 'thick'>[] = [
  { value: 'thin', label: 'Thin', preview: <LineSample width={1} /> },
  { value: 'medium', label: 'Medium', preview: <LineSample width={1.75} /> },
  { value: 'thick', label: 'Thick', preview: <LineSample width={3} /> },
];
const STYLE_OPTIONS: Option<LineValue>[] = [
  { value: 'solid', label: 'Solid', preview: <LineSample style="solid" /> },
  { value: 'dashed', label: 'Dashed', preview: <LineSample style="dashed" /> },
  { value: 'dotted', label: 'Dotted', preview: <LineSample style="dotted" /> },
];
const HEAD_LABELS: Record<ArrowHeadValue, string> = { none: 'None', arrow: 'Arrow', open: 'Open', dot: 'Dot' };
const ALIGN_OPTIONS: Option<'left' | 'center' | 'right'>[] = [
  { value: 'left', label: 'Align left', preview: <AlignGlyph align="left" /> },
  { value: 'center', label: 'Align centre', preview: <AlignGlyph align="center" /> },
  { value: 'right', label: 'Align right', preview: <AlignGlyph align="right" /> },
];
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The contextual toolbar for a diagram selection, docked at the bottom centre of
 * the diagram. Every control turns into a code edit through `onAction`.
 */
export function ElementToolbar(props: ElementToolbarProps) {
  const { selection, ctx, theme, icons, iconSet, container, avoid, onAction, editing, notice } = props;
  const target = selectionTarget(selection, ctx);
  const controls = toolbarControls(selection, ctx);
  const [open, setOpen] = useState<Pop | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<Pop, HTMLButtonElement>());
  const [placement, setPlacement] = useState<Placement>({ at: 'bottom' });
  // The text being typed in the inline editor (Done saves it).
  const draft = useRef('');

  // A new selection (or starting to edit) closes any open menu.
  const selectionKey = `${selection.kind}:${selection.ids.join('\u0000')}`;
  useEffect(() => setOpen(null), [selectionKey, !!editing]);

  // When the bar goes away (selection cleared, delete) while it has focus, hand
  // focus to the diagram / canvas around it, so keys like ⌘Z keep working.
  // (React removes the bar before cleanup runs, so focus is tracked while it's here.)
  const hadFocus = useRef(false);
  useEffect(() => {
    const el = bar.current;
    const host = el?.parentElement?.closest<HTMLElement>('[tabindex]');
    const onIn = () => (hadFocus.current = true);
    const onOut = (e: FocusEvent) => {
      if (!el?.contains(e.relatedTarget as Node | null) && e.relatedTarget) hadFocus.current = false;
    };
    el?.addEventListener('focusin', onIn);
    el?.addEventListener('focusout', onOut);
    return () => {
      el?.removeEventListener('focusin', onIn);
      el?.removeEventListener('focusout', onOut);
      if (!hadFocus.current) return;
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) host?.focus({ preventScroll: true });
      });
    };
  }, []);

  const close = (refocus = true) => {
    const button = open ? buttons.current.get(open) : undefined;
    setOpen(null);
    if (refocus) button?.focus({ preventScroll: true });
  };

  // Menus close on any press outside the bar and the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (bar.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // Dock at the bottom centre; if that would cover the selection, lift the bar above it, else move it to the top.
  useLayoutEffect(() => {
    const root = container.current;
    const el = bar.current;
    if (!root || !el) return;
    const W = root.clientWidth;
    const H = root.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = (W - w) / 2;
    const top = H - GAP - h;
    // The note above the bar (hint or refusal) needs room too.
    const note = notice || editing || selection.ids.length > 1 ? 32 : 0;
    let next: Placement = { at: 'bottom' };
    if (avoid && overlaps(avoid, { x: left - 8, y: top - 8 - note, width: w + 16, height: h + 16 + note })) {
      const above = avoid.y - 12;
      if (above - h - note >= HEADER) next = { at: 'lifted', bottom: H - above };
      else next = { at: 'top' };
    }
    setPlacement((p) => (p.at === next.at && (p.at !== 'lifted' || (next.at === 'lifted' && Math.abs(p.bottom - next.bottom) < 1)) ? p : next));
  });

  // Menus open above the bar (below it when the bar is at the top), next to their button, inside the diagram.
  useLayoutEffect(() => {
    const root = container.current;
    const el = pop.current;
    const button = open ? buttons.current.get(open) : undefined;
    if (!root || !el || !button || !bar.current) return;
    const r = root.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const barBox = bar.current.getBoundingClientRect();
    const w = el.offsetWidth;
    const x = Math.max(8, Math.min(r.width - w - 8, b.left + b.width / 2 - w / 2 - r.left));
    el.style.setProperty('--od-pop-left', `${Math.round(x)}px`);
    if (placement.at === 'top') {
      el.style.setProperty('--od-pop-top', `${Math.round(barBox.bottom - r.top + 8)}px`);
      el.style.setProperty('--od-pop-bottom', 'auto');
    } else {
      el.style.setProperty('--od-pop-bottom', `${Math.round(r.bottom - barBox.top + 8)}px`);
      el.style.setProperty('--od-pop-top', 'auto');
    }
    el.style.visibility = 'visible';
  });

  if (!target) return null;
  const nodes = selectedNodes(selection, ctx);
  const edges = selectedEdges(selection, ctx);
  const single = nodes[0];
  const act = (action: ToolbarAction, keepOpen = false) => {
    const done = onAction(action);
    if (done && !keepOpen) close();
    return done;
  };
  const set = (key: string, value: string | null, keepOpen = false) => act({ type: 'set', key, value }, keepOpen);

  const toggle = (id: Pop) => setOpen((o) => (o === id ? null : id));
  const ref = (id: Pop) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(id, el);
    else buttons.current.delete(id);
  };
  const menuButton = (id: Pop, label: string, content: ReactNode, title = label) => (
    <button key={id} ref={ref(id)} type="button" className="od-etb-btn" aria-label={label} title={title} aria-haspopup="menu" aria-expanded={open === id} onClick={() => toggle(id)}>
      {content}
      <Caret />
    </button>
  );
  const mixedText = <span className="od-etb-mixed">Mixed</span>;

  const isEdge = selection.kind === 'edge';
  const isLabel = selection.kind === 'label';
  const color = propertyValue(selection, ctx, isLabel ? 'textColor' : 'color');
  const defaultInk = isEdge ? theme.color.edge : target === 'group' ? theme.group.stroke : isLabel ? theme.color.text : theme.node.stroke;
  const colorDot = (value: string | undefined, mixed: boolean) =>
    mixed ? mixedText : <span className="od-etb-dot" style={{ background: swatchColor(theme, value) ?? defaultInk }} />;
  const size = textSizeValue(selection, ctx);
  const textButton = (id: Pop, label: string) => menuButton(id, label, size.mixed ? <><span className="od-etb-t">T</span>{mixedText}</> : <><span className="od-etb-t">T</span><span className="od-etb-muted">{size.size}px</span></>);
  const iconValue = propertyValue(selection, ctx, 'icon');

  const render = (control: ToolbarControl): ReactNode => {
    switch (control) {
      case 'count':
        return (
          <span key="count" className="od-etb-count">
            {selection.ids.length} selected
          </span>
        );
      case 'editText':
        return (
          <button key="edit" type="button" className="od-etb-btn od-etb-edit" onClick={props.onStartEdit} title="Edit text (Enter)">
            {isEdge ? 'Edit label' : target === 'group' ? 'Edit title' : 'Edit text'}
          </button>
        );
      case 'shape':
        return menuButton('shape', 'Shape', <ShapeSample shape={propertyValue(selection, ctx, 'shape').value ?? 'rectangle'} />);
      case 'icon': {
        const resolved = iconValue.value ? resolveIcon(iconValue.value, icons, iconSet) : undefined;
        return menuButton(
          'icon',
          iconValue.mixed ? 'Icon, mixed' : 'Icon',
          iconValue.mixed ? mixedText : iconValue.value ? (
            <svg width="18" height="18" aria-hidden="true">
              <Icon name={iconValue.value} resolved={resolved} x={0} y={0} size={18} tint={resolved?.tint ?? theme.color.text} theme={theme} />
            </svg>
          ) : (
            <IconGlyph />
          ),
        );
      }
      case 'color':
        return menuButton('color', 'Colour', colorDot(color.value, color.mixed));
      case 'textColor':
        return menuButton('textColor', 'Text colour', <span className="od-etb-a" style={{ textDecorationColor: swatchColor(theme, color.value) ?? theme.color.text }}>A</span>);
      case 'border':
        return menuButton('border', 'Border', <BorderGlyph />);
      case 'text':
        return textButton('text', target === 'group' ? 'Title size' : 'Text');
      case 'iconSize': {
        const v = iconSizeValue(selection, ctx);
        return menuButton('iconSize', 'Icon size', v.mixed ? mixedText : (SIZE_LABELS[sizeName(v.size, 'icon') ?? 'medium'] ?? `${v.size}px`));
      }
      case 'labelSize': {
        const v = textSizeValue(selection, ctx);
        const name = sizeName(v.size, 'label');
        return menuButton('labelSize', 'Label size', v.mixed ? mixedText : name ? SIZE_LABELS[name] : `${v.size}px`);
      }
      case 'routing': {
        const v = propertyValue(selection, ctx, 'routing');
        return menuButton('routing', 'Routing', v.mixed ? mixedText : v.value === 'straight' ? 'Straight' : 'Auto');
      }
      case 'line':
        return menuButton('line', 'Line', <LineGlyph />, 'Line style and width');
      case 'startArrow':
      case 'endArrow': {
        const end = control === 'startArrow' ? 'start' : 'end';
        const v = headValue(selection, ctx, end);
        return menuButton(
          control,
          end === 'start' ? 'Start arrowhead' : 'End arrowhead',
          v.mixed ? mixedText : <><HeadSample head={v.value as ArrowHeadValue} start={end === 'start'} small />{HEAD_LABELS[v.value as ArrowHeadValue]}</>,
        );
      }
      case 'reverse':
        return (
          <button key="reverse" type="button" className="od-etb-btn" aria-label="Reverse direction" title="Reverse direction" onClick={() => act({ type: 'reverse' })}>
            <ReverseGlyph />
          </button>
        );
      case 'more':
        return (
          <button key="more" ref={ref('more')} type="button" className="od-etb-btn" aria-label="More" title="More" aria-haspopup="menu" aria-expanded={open === 'more'} onClick={() => toggle('more')}>
            <MoreGlyph />
          </button>
        );
      case 'delete': {
        const what = isEdge ? 'arrows' : 'boxes';
        return (
          <button key="delete" type="button" className="od-etb-btn" aria-label={`Delete ${selection.ids.length} ${what}`} title="Delete (⌫)" onClick={() => act({ type: 'delete' })}>
            <TrashGlyph />
          </button>
        );
      }
    }
  };

  // Separators: after Edit text / the count, before More / Delete, and around the arrowheads.
  const items: ReactNode[] = [];
  controls.forEach((control, i) => {
    const prev = controls[i - 1];
    if (prev && (prev === 'editText' || prev === 'count' || control === 'more' || control === 'delete' || control === 'startArrow')) items.push(<div key={`sep-${i}`} className="od-etb-sep" />);
    items.push(render(control));
  });

  const editingItems = editing && (
    <>
      <button type="button" className="od-etb-btn od-etb-done" onClick={() => props.onCommitEdit(draft.current)}>
        Done
      </button>
      <div className="od-etb-sep" />
      {isEdge ? menuButton('labelSize', 'Label size', (() => {
        const name = sizeName(size.size, 'label');
        return name ? SIZE_LABELS[name] : `${size.size}px`;
      })()) : textButton('textSize', 'Text size')}
      {target === 'box' && menuButton('align', 'Align', <AlignGlyph align={(propertyValue(selection, ctx, 'textAlign').value as 'left' | 'right' | undefined) ?? 'center'} />)}
      {!isEdge && menuButton('textColor', 'Text colour', <span className="od-etb-a" style={{ textDecorationColor: swatchColor(theme, propertyValue(selection, ctx, 'textColor').value) ?? theme.color.text }}>A</span>)}
    </>
  );

  const sizeMenu = (withTypeface: boolean, withAlign: boolean) => {
    const kind = 'text';
    return (
      <>
        <MenuLabel>{target === 'group' ? 'Title size' : 'Size'}</MenuLabel>
        <SizeStepper
          size={size.mixed ? undefined : size.size}
          named={size.mixed ? undefined : sizeName(size.size, kind)}
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          onStep={(n) => set('textSize', String(n), true)}
          onName={(name) => set('textSize', name, true)}
        />
        {withTypeface && (
          <>
            <MenuSeparator />
            <MenuLabel>Typeface</MenuLabel>
            {typefaceList()}
          </>
        )}
        {withAlign && (
          <>
            <MenuSeparator />
            <MenuLabel>Align</MenuLabel>
            <Segmented label="Align" options={ALIGN_OPTIONS} value={propertyValue(selection, ctx, 'textAlign').value ?? 'center'} onPick={(v) => set('textAlign', v, true)} />
          </>
        )}
      </>
    );
  };
  const typefaceList = () => {
    const v = propertyValue(selection, ctx, 'typeface');
    const current = v.mixed ? undefined : (v.value ?? ctx.diagram.settings.typeface ?? 'clean');
    const fonts: Record<string, string> = { rough: theme.font.rough, clean: theme.font.sans, mono: theme.font.mono };
    return <OptionList options={TYPEFACES.map((t) => ({ value: t, label: capital(t), preview: <span className="od-etb-aa" style={{ fontFamily: fonts[t], fontSize: t === 'rough' ? 18 : undefined }}>Aa</span> }))} value={current} onPick={(t) => set('typeface', t, true)} />;
  };

  const menu = (id: Pop): ReactNode => {
    const onClose = () => close();
    switch (id) {
      case 'shape':
        return (
          <Menu label="Shape" onClose={onClose} width={208} className="od-etb-pop-list">
            <OptionList options={SHAPES.map((s) => ({ value: s, label: capital(s), preview: <ShapeSample shape={s} /> }))} value={propertyValue(selection, ctx, 'shape').value ?? 'rectangle'} onPick={(s) => set('shape', s)} />
          </Menu>
        );
      case 'icon':
        return (
          <Menu label="Icon" onClose={onClose} width={400} className="od-etb-pop-flush">
            <IconPicker theme={theme} icons={icons} iconSet={iconSet} value={iconValue.value} mixed={iconValue.mixed} onPick={(name) => set('icon', name)} />
          </Menu>
        );
      case 'color':
      case 'textColor': {
        const key = id === 'textColor' || isLabel ? 'textColor' : 'color';
        const v = propertyValue(selection, ctx, key);
        return (
          <Menu label={key === 'textColor' ? 'Text colour' : 'Colour'} onClose={onClose} width={232} columns={6}>
            <ColorGrid theme={theme} value={v.value} mixed={v.mixed} label={key === 'textColor' ? 'Text colour' : 'Colour'} property={key} onPick={(value) => set(key, value)} />
          </Menu>
        );
      }
      case 'border':
      case 'line': {
        const style = id === 'line' ? lineValue(selection, ctx) : propertyValue(selection, ctx, 'border');
        const width = propertyValue(selection, ctx, 'strokeWidth');
        return (
          <Menu label={id === 'line' ? 'Line' : 'Border'} onClose={onClose} width={252}>
            <MenuLabel>{id === 'line' ? 'Line' : 'Style'}</MenuLabel>
            <Segmented label="Style" tall options={STYLE_OPTIONS} value={style.mixed ? undefined : (style.value ?? 'solid')} onPick={(v) => (id === 'line' ? act({ type: 'line', value: v }, true) : set('border', v, true))} />
            <MenuLabel>Width</MenuLabel>
            <Segmented label="Width" tall options={WIDTH_OPTIONS} value={width.mixed ? undefined : (widthName(width.value) ?? (width.value ? undefined : 'thin'))} onPick={(v) => set('strokeWidth', v, true)} />
          </Menu>
        );
      }
      case 'text':
        return (
          <Menu label="Text" onClose={onClose} width={232}>
            {sizeMenu(true, target === 'box')}
          </Menu>
        );
      case 'textSize':
        return (
          <Menu label="Text size" onClose={onClose} width={232}>
            {sizeMenu(false, false)}
          </Menu>
        );
      case 'typeface':
        return (
          <Menu label="Typeface" onClose={onClose} width={200}>
            {typefaceList()}
          </Menu>
        );
      case 'align':
        return (
          <Menu label="Align" onClose={onClose} width={160}>
            <Segmented label="Align" options={ALIGN_OPTIONS} value={propertyValue(selection, ctx, 'textAlign').value ?? 'center'} onPick={(v) => set('textAlign', v, true)} />
          </Menu>
        );
      case 'iconSize': {
        const v = iconSizeValue(selection, ctx);
        const current = v.mixed ? undefined : sizeName(v.size, 'icon');
        const box = (n: number) => <span className="od-etb-sizebox" style={{ width: n, height: n }} />;
        return (
          <Menu label="Icon size" onClose={onClose} width={200}>
            <OptionList tall options={[
              { value: 'small', label: 'Small', preview: box(12), hint: '36' },
              { value: 'medium', label: 'Medium', preview: box(17), hint: '50' },
              { value: 'large', label: 'Large', preview: box(23), hint: '72' },
            ]} value={current} onPick={(s) => set('iconSize', s)} />
          </Menu>
        );
      }
      case 'labelSize': {
        const current = size.mixed ? undefined : sizeName(size.size, 'label');
        return (
          <Menu label="Label size" onClose={onClose} width={176}>
            <OptionList options={[
              { value: 'small', label: 'Small', hint: '11' },
              { value: 'medium', label: 'Medium', hint: '13' },
              { value: 'large', label: 'Large', hint: '16' },
            ]} value={current} onPick={(s) => set('labelSize', s)} />
          </Menu>
        );
      }
      case 'routing': {
        const v = propertyValue(selection, ctx, 'routing');
        return (
          <Menu label="Routing" onClose={onClose} width={176}>
            <OptionList options={[{ value: 'auto', label: 'Auto', hint: 'around boxes' }, { value: 'straight', label: 'Straight' }]} value={v.mixed ? undefined : (v.value ?? 'auto')} onPick={(r) => set('routing', r)} />
          </Menu>
        );
      }
      case 'startArrow':
      case 'endArrow': {
        const end = id === 'startArrow' ? 'start' : 'end';
        const v = headValue(selection, ctx, end);
        return (
          <Menu label={end === 'start' ? 'Start arrowhead' : 'End arrowhead'} onClose={onClose} width={176}>
            <OptionList options={(['none', 'arrow', 'open', 'dot'] as const).map((h) => ({ value: h, label: HEAD_LABELS[h], preview: <HeadSample head={h} start={end === 'start'} /> }))} value={v.mixed ? undefined : v.value} onPick={(h) => act({ type: 'arrowhead', end, value: h })} />
          </Menu>
        );
      }
      case 'more':
        return (
          <Menu label="More" onClose={onClose} width={264}>
            <MoreMenu {...props} target={target} single={single} edges={edges.length} act={act} set={set} />
          </Menu>
        );
      default:
        return null;
    }
  };

  const wrapClass = `od-etb-wrap od-etb-${placement.at}`;
  const wrapStyle = placement.at === 'lifted' ? { bottom: placement.bottom } : undefined;
  return (
    <>
      <style>{TOOLBAR_CSS}</style>
      {editing && <InlineEditor key={selectionKey} editing={editing} draft={draft} onCommit={props.onCommitEdit} onCancel={props.onCancelEdit} barRef={bar} popRef={pop} />}
      <div className={wrapClass} style={wrapStyle}>
        {(notice || editing || selection.ids.length > 1) && (
          <div className={`od-etb-note${notice ? ' od-etb-note-warn' : ''}`} role={notice ? 'alert' : 'status'}>
            {notice ?? (!editing ? (
              <span>Shift-click to add or remove · one change applies to all {selection.ids.length}</span>
            ) : (
              <>
                <span><kbd>Enter</kbd> save</span>
                <span><kbd>Esc</kbd> cancel</span>
                <span>{isEdge ? "Sets the arrow's label" : editRenames(selection, ctx) ? 'Renames it everywhere in the code' : 'Sets its label'}</span>
              </>
            ))}
          </div>
        )}
        <div
          ref={bar}
          className="od-etb"
          role="toolbar"
          aria-label={editing ? 'Editing text' : target === 'boxes' ? `${selection.ids.length} boxes` : target === 'arrows' ? `${selection.ids.length} arrows` : TARGET_NAMES[target]}
          // Presses on the bar never reach the diagram (no deselect, no pan).
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {editing ? editingItems : items}
        </div>
      </div>
      {open && (
        <div ref={pop} className={`od-etb-anchor od-etb-anchor-${placement.at === 'top' ? 'below' : 'above'}`} style={{ visibility: 'hidden' }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {menu(open)}
        </div>
      )}
    </>
  );
}

const TARGET_NAMES = { box: 'Box', icon: 'Icon node', group: 'Group', arrow: 'Arrow', label: 'Label', boxes: 'Boxes', arrows: 'Arrows' } as const;

function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The More (⋯) menu: description, link, group options, delete. */
function MoreMenu({ selection, ctx, target, single, edges, act, set, onOpenGroup, canOpenGroup }: ElementToolbarProps & {
  target: NonNullable<ReturnType<typeof selectionTarget>>;
  single: ReturnType<typeof selectedNodes>[number] | undefined;
  edges: number;
  act: (action: ToolbarAction, keepOpen?: boolean) => boolean;
  set: (key: string, value: string | null, keepOpen?: boolean) => boolean;
}) {
  const [field, setField] = useState<'description' | 'link' | null>(null);
  if (selection.kind === 'edge') {
    return <CommandRow icon={<TrashGlyph size={16} />} label={edges > 1 ? 'Delete arrows' : 'Delete arrow'} hint="⌫" danger onClick={() => act({ type: 'delete' })} />;
  }
  if (!single) return null;
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
  const group = target === 'group';
  const collapsed = /^(true|yes|1)$/i.test(single.properties.collapsed ?? '');
  void ctx;
  return (
    <>
      {group && onOpenGroup && (!canOpenGroup || canOpenGroup(single.id)) && <CommandRow icon={<OpenGlyph />} label="Open group" hint="Double-click" onClick={() => onOpenGroup(single.id)} />}
      {group && <CommandRow icon={<CollapsedGlyph />} label="Collapsed by default" checked={collapsed} onClick={() => set('collapsed', collapsed ? null : 'true', true)} />}
      <CommandRow icon={<DescriptionGlyph />} label="Description" hint={single.properties.description ? 'Edit' : undefined} onClick={() => setField('description')} />
      <CommandRow icon={<LinkGlyph />} label="Link" hint={single.properties.link ? 'Edit' : undefined} onClick={() => setField('link')} />
      <MenuSeparator />
      {group ? (
        <>
          <CommandRow icon={<UngroupGlyph />} label="Ungroup (keep contents)" onClick={() => act({ type: 'delete', keepContents: true })} />
          <CommandRow icon={<TrashGlyph size={16} />} label="Delete group and contents" hint="⌫" danger onClick={() => act({ type: 'delete' })} />
        </>
      ) : (
        <CommandRow icon={<TrashGlyph size={16} />} label="Delete" hint="⌫" danger onClick={() => act({ type: 'delete' })} />
      )}
    </>
  );
}

/** A one-line field inside a menu (description, link): Enter saves, Escape goes back. */
function FieldEditor({ label, placeholder, initial, onSave, onBack }: { label: string; placeholder: string; initial: string; onSave: (value: string) => boolean; onBack: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="od-etb-fieldrow">
      <MenuLabel>{label}</MenuLabel>
      <input
        data-autofocus
        className="od-etb-menu-input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onSave(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }
        }}
      />
      <div className="od-etb-fieldrow-actions">
        <button type="button" role="menuitem" className="od-etb-btn" onClick={onBack}>
          Back
        </button>
        <button type="button" role="menuitem" className="od-etb-btn od-etb-done" onClick={() => onSave(value)}>
          Save
        </button>
      </div>
    </div>
  );
}

/** The text field laid over the element's label while editing. */
function InlineEditor({ editing, draft, onCommit, onCancel, barRef, popRef }: { editing: ToolbarEditing; draft: { current: string }; onCommit: (text: string) => boolean; onCancel: () => void; barRef: RefObject<HTMLDivElement | null>; popRef: RefObject<HTMLDivElement | null> }) {
  const [text, setText] = useState(editing.initial);
  draft.current = text;
  const input = useRef<HTMLInputElement>(null);
  // Set once Enter or Escape decided; the blur that follows when the field goes away must not save again.
  const settled = useRef(false);
  const settle = (fn: () => boolean | void) => {
    settled.current = true;
    if (fn() === false) settled.current = false;
  };
  useEffect(() => {
    // Next frame: the click that started editing must not take focus back.
    const frame = requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const { rect } = editing;
  return (
    <input
      ref={input}
      className="od-etb-field"
      aria-label="Text"
      value={text}
      spellCheck={false}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, fontSize: editing.fontSize, fontFamily: editing.fontFamily, textAlign: editing.align }}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          settle(() => onCommit(text));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          settle(onCancel);
        } else {
          // Typing never triggers the diagram's shortcuts (Backspace, +, 0…).
          e.stopPropagation();
        }
      }}
      onBlur={(e) => {
        // Moving to the toolbar (text size, colour, Done) keeps editing; anywhere else saves.
        const next = e.relatedTarget as Node | null;
        if (settled.current || (next && (barRef.current?.contains(next) || popRef.current?.contains(next)))) return;
        settled.current = true;
        if (!onCommit(text)) onCancel();
      }}
    />
  );
}

// Styled only from the theme's --od-* variables, so dark mode follows.
const TOOLBAR_CSS = `
.od-etb-wrap { position: absolute; left: 50%; bottom: var(--od-space-5); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: var(--od-space-2); max-width: calc(100% - 16px); z-index: 3; pointer-events: none; }
.od-etb-wrap.od-etb-top { bottom: auto; top: 56px; flex-direction: column-reverse; }
.od-etb { pointer-events: auto; display: flex; align-items: center; gap: 2px; padding: var(--od-space-1); max-width: 100%; box-sizing: border-box; background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-xl); box-shadow: var(--od-shadow-chrome); white-space: nowrap; font: var(--od-text-ui); color: var(--od-color-text); }
.od-etb-btn { height: 34px; min-width: 34px; flex: none; border: 0; background: transparent; border-radius: var(--od-radius-md); padding: 0 var(--od-space-2); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: var(--od-text-ui); font-size: 13px; font-weight: 500; color: var(--od-color-text); cursor: pointer; }
.od-etb-btn:hover, .od-etb-btn[aria-expanded="true"] { background: var(--od-color-hover); }
.od-etb-btn:focus-visible, .od-etb-pop button:focus-visible, .od-etb-sw:focus-visible { outline: 2px solid var(--od-color-focus-ring); outline-offset: 1px; }
.od-etb-btn:disabled { color: var(--od-color-text-subtle); cursor: default; background: transparent; }
.od-etb-edit { border: 1px solid var(--od-color-border); background: var(--od-color-canvas); padding: 0 var(--od-space-3); }
.od-etb-done { background: var(--od-color-accent); color: var(--od-color-on-accent); padding: 0 14px; }
.od-etb-done:hover { background: var(--od-color-accent); filter: brightness(1.08); }
.od-etb-sep { width: 1px; height: 20px; flex: none; background: var(--od-color-border); margin: 0 var(--od-space-1); }
.od-etb-caret { color: var(--od-color-text-muted); flex: none; }
.od-etb-dot { width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--od-color-border); }
.od-etb-t { font-weight: 600; }
.od-etb-muted { color: var(--od-color-text-muted); font-variant-numeric: tabular-nums; }
.od-etb-mixed { color: var(--od-color-text-muted); font-style: italic; font-weight: 400; }
.od-etb-a { font-weight: 600; text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 3px; }
.od-etb-count { height: 34px; display: inline-flex; align-items: center; padding: 0 var(--od-space-3); border-radius: var(--od-radius-md); background: var(--od-color-accent-soft); color: var(--od-color-accent); font-size: 13px; font-weight: 600; flex: none; }
.od-etb-note { pointer-events: auto; display: flex; align-items: center; gap: 10px; font: var(--od-text-ui); font-size: 12px; color: var(--od-color-text-muted); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-md); padding: 4px 10px; box-shadow: var(--od-shadow-chrome); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-etb-note-warn { color: var(--od-color-danger); background: var(--od-color-danger-soft); border-color: transparent; }
.od-etb-note kbd { font: inherit; font-size: 11px; font-weight: 500; padding: 1px 6px; border: 1px solid var(--od-color-border-strong); border-bottom-width: 2px; border-radius: 5px; background: var(--od-color-raised); color: var(--od-color-text); margin-right: 4px; }
.od-etb-anchor { position: absolute; left: var(--od-pop-left, 50%); top: var(--od-pop-top, auto); bottom: var(--od-pop-bottom, auto); z-index: 4; }
.od-etb-pop { box-sizing: border-box; max-width: calc(100cqw - 16px); max-height: calc(100cqh - 96px); overflow: auto; padding: var(--od-space-2); background: var(--od-color-raised); border: 1px solid var(--od-color-border); border-radius: var(--od-radius-xl); box-shadow: var(--od-shadow-chrome); font: var(--od-text-ui); font-size: 13px; color: var(--od-color-text); }
.od-etb-pop-flush { padding: 0; overflow: hidden; }
.od-etb-sheet-handle { display: none; }
.od-etb-plabel { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--od-color-text-muted); padding: 4px 6px 8px; }
.od-etb-msep { height: 1px; background: var(--od-color-border); margin: 6px calc(-1 * var(--od-space-2)) 4px; }
.od-etb-options { display: flex; flex-direction: column; gap: 1px; }
.od-etb-opt, .od-etb-cmd { display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border: 0; border-radius: var(--od-radius-md); background: transparent; font: inherit; color: var(--od-color-text); text-align: left; cursor: pointer; white-space: nowrap; }
.od-etb-opt-tall { height: 40px; gap: 12px; }
.od-etb-cmd { height: 34px; }
.od-etb-opt:hover, .od-etb-cmd:hover { background: var(--od-color-hover); }
.od-etb-opt[aria-checked="true"] { background: var(--od-color-accent); color: var(--od-color-on-accent); }
.od-etb-opt-preview { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; }
.od-etb-opt-hint, .od-etb-cmd-hint { margin-left: auto; font-size: 12px; opacity: 0.7; font-variant-numeric: tabular-nums; }
.od-etb-cmd-hint { opacity: 1; color: var(--od-color-text-muted); }
.od-etb-danger, .od-etb-danger .od-etb-cmd-hint { color: var(--od-color-danger); }
.od-etb-aa { width: 44px; font-size: 15px; }
.od-etb-sizebox { display: block; border: 1.5px solid currentColor; border-radius: 3px; box-sizing: border-box; }
.od-etb-switch { margin-left: auto; width: 30px; height: 18px; border-radius: 9px; background: var(--od-color-border-strong); position: relative; flex: none; transition: background var(--od-motion-fast); }
.od-etb-switch::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--od-color-raised); transition: transform var(--od-motion-fast); }
.od-etb-switch[data-on] { background: var(--od-color-accent); }
.od-etb-switch[data-on]::after { transform: translateX(12px); }
.od-etb-seg { display: flex; gap: 2px; margin: 0 6px 10px; padding: 2px; background: var(--od-color-hover); border-radius: var(--od-radius-lg); }
.od-etb-seg button { flex: 1; height: 32px; border: 0; border-radius: var(--od-radius-md); background: transparent; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; color: var(--od-color-text); font: inherit; font-size: 12px; }
.od-etb-seg-tall button { height: 40px; flex-direction: column; font-size: 11px; }
.od-etb-seg button[aria-checked="true"] { background: var(--od-color-raised); box-shadow: 0 1px 2px var(--od-color-border-strong); font-weight: 600; }
.od-etb-stepper { display: flex; align-items: center; justify-content: space-between; margin: 0 6px 6px; padding: 2px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); }
.od-etb-step { width: 30px; height: 30px; border: 0; border-radius: var(--od-radius-md); background: transparent; font: inherit; font-size: 16px; font-weight: 500; color: var(--od-color-text); cursor: pointer; }
.od-etb-step:hover:not(:disabled) { background: var(--od-color-hover); }
.od-etb-step:disabled { color: var(--od-color-text-subtle); cursor: default; }
.od-etb-step-value { font-weight: 500; font-variant-numeric: tabular-nums; }
.od-etb-swatches { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--od-space-2); padding: 0 6px 6px; }
.od-etb-sw { position: relative; width: 26px; height: 26px; border-radius: var(--od-radius-md); border: 0; box-shadow: inset 0 0 0 1px var(--od-color-border); padding: 0; cursor: pointer; }
.od-etb-sw[aria-checked="true"] { box-shadow: 0 0 0 2px var(--od-color-raised), 0 0 0 4px var(--od-color-accent); }
.od-etb-sw-default { background: linear-gradient(135deg, var(--od-color-raised) 46%, var(--od-color-danger) 47%, var(--od-color-danger) 53%, var(--od-color-raised) 54%); }
.od-etb-sw-custom { display: block; overflow: hidden; background: conic-gradient(var(--od-color-danger), var(--od-color-warning), var(--od-color-success), var(--od-color-accent), var(--od-color-danger)); }
.od-etb-sw-custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.od-etb-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.od-etb-color-foot { display: flex; align-items: center; gap: var(--od-space-2); margin: 4px 6px 2px; padding-top: var(--od-space-2); border-top: 1px solid var(--od-color-border); }
.od-etb-color-chip { width: 16px; height: 16px; border-radius: var(--od-radius-sm); box-shadow: inset 0 0 0 1px var(--od-color-border); flex: none; }
.od-etb-color-chip[data-default] { background: linear-gradient(135deg, var(--od-color-raised) 44%, var(--od-color-danger) 45%, var(--od-color-danger) 55%, var(--od-color-raised) 56%) !important; }
.od-etb-color-foot code { margin-left: auto; color: var(--od-color-text-muted); font-family: var(--od-font-mono); font-size: 12px; white-space: nowrap; }
.od-etb-icons-search { display: flex; align-items: center; gap: var(--od-space-2); height: 44px; padding: 0 var(--od-space-3); border-bottom: 1px solid var(--od-color-border); color: var(--od-color-text-muted); }
.od-etb-icons-search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 14px; color: var(--od-color-text); }
.od-etb-icons-count { font-size: 12px; white-space: nowrap; }
.od-etb-chips { display: flex; gap: 4px; padding: 10px var(--od-space-3) 2px; flex-wrap: wrap; }
.od-etb-chip { height: 26px; padding: 0 9px; border-radius: 13px; border: 1px solid var(--od-color-border); background: var(--od-color-raised); font: inherit; font-size: 12px; font-weight: 500; color: var(--od-color-text-muted); cursor: pointer; }
.od-etb-chip:hover { background: var(--od-color-hover); }
.od-etb-chip[aria-pressed="true"] { background: var(--od-color-text); border-color: var(--od-color-text); color: var(--od-color-raised); }
.od-etb-icon-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2px; padding: var(--od-space-2) var(--od-space-2) var(--od-space-1); height: 196px; overflow-y: auto; align-content: start; }
.od-etb-tile { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; border: 0; background: transparent; padding: 6px 0; border-radius: var(--od-radius-lg); cursor: pointer; font: inherit; font-size: 11px; color: var(--od-color-text-muted); }
.od-etb-tile-box { width: 44px; height: 44px; border: 1px solid var(--od-color-border); border-radius: var(--od-radius-lg); display: grid; place-items: center; color: var(--od-color-text); background: var(--od-color-raised); }
.od-etb-tile-name { max-width: 100%; padding: 0 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.od-etb-tile[data-active] .od-etb-tile-box { background: var(--od-color-hover); }
.od-etb-tile[aria-checked="true"] .od-etb-tile-box { border-color: var(--od-color-accent); box-shadow: 0 0 0 3px var(--od-color-accent-soft); }
.od-etb-empty { grid-column: 1 / -1; margin: 24px 0; text-align: center; color: var(--od-color-text-muted); }
.od-etb-icons-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--od-space-2); height: 38px; padding: 0 var(--od-space-3); border-top: 1px solid var(--od-color-border); color: var(--od-color-text-muted); font-size: 12px; white-space: nowrap; }
.od-etb-link { border: 0; background: transparent; padding: 0; font: inherit; font-size: 12px; font-weight: 500; color: var(--od-color-text); cursor: pointer; }
.od-etb-link:hover { text-decoration: underline; }
.od-etb-fieldrow { display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px; }
.od-etb-menu-input { margin: 0 6px; height: 32px; padding: 0 10px; border: 1px solid var(--od-color-border-strong); border-radius: var(--od-radius-md); background: var(--od-color-canvas); font: inherit; color: var(--od-color-text); outline: none; }
.od-etb-menu-input:focus { border-color: var(--od-color-accent); box-shadow: 0 0 0 3px var(--od-color-accent-soft); }
.od-etb-fieldrow-actions { display: flex; justify-content: flex-end; gap: 4px; margin: 0 6px; }
.od-etb-fieldrow-actions .od-etb-btn { height: 30px; }
.od-etb-field { position: absolute; z-index: 3; box-sizing: border-box; min-width: 80px; padding: 0 6px; border: 1.5px solid var(--od-color-accent); border-radius: var(--od-radius-sm); background: var(--od-color-raised); color: var(--od-color-text); box-shadow: 0 0 0 3px var(--od-color-accent-soft); outline: none; font-weight: 500; }
/* Narrow diagrams (phones): the bar scrolls sideways and menus open as a sheet from the bottom. */
@container od (max-width: 640px) {
  .od-etb-wrap { left: var(--od-space-2); right: var(--od-space-2); transform: none; max-width: none; bottom: var(--od-space-3); }
  .od-etb-wrap.od-etb-lifted { left: var(--od-space-2); }
  .od-etb { overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; justify-content: flex-start; align-self: center; }
  .od-etb::-webkit-scrollbar { display: none; }
  .od-etb-anchor { left: 0 !important; right: 0; top: auto !important; bottom: 0 !important; }
  .od-etb-pop { width: 100% !important; max-width: none; max-height: 70cqh; border-radius: var(--od-radius-xl) var(--od-radius-xl) 0 0; border-bottom: 0; padding-bottom: var(--od-space-4); }
  .od-etb-pop-flush { padding-bottom: 0; }
  .od-etb-sheet-handle { display: block; width: 36px; height: 4px; border-radius: 2px; background: var(--od-color-border-strong); margin: 0 auto var(--od-space-2); }
  .od-etb-pop-flush .od-etb-sheet-handle { margin-top: var(--od-space-2); }
  .od-etb-icons-foot span { display: none; }
}
`;
