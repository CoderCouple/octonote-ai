import type { BlockKind, Participant, SequenceDiagram } from '../dsl/sequence';
import { resolveIcon, type IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { estimateTextWidth, type TextMeasurer } from '../layout/layout';
import { Icon, Wash, WatercolorDefs } from '../react/DiagramSvg';
import { swatchFor } from '../react/theme';
import type { Theme } from '../theme/tokens';

// Layout and rendering for sequence diagrams: participants as columns with
// lifelines, messages stacked top to bottom, activation bars, and blocks
// (loop / alt / opt / par / break) framing the participants they involve.

const HEADER_H = 52;
const TOP = 24;
const MESSAGE_GAP = 46;
const SELF_GAP = 62;
const BLOCK_HEADER = 34;
const SECTION_GAP = 30;
const BLOCK_END = 18;
const ACTIVATION_W = 10;

export interface SeqParticipantLayout {
  participant: Participant;
  x: number;
  width: number;
  labelWidth: number;
}

export interface SeqMessageLayout {
  from: number;
  to: number;
  /** Participant names at each end. */
  fromName: string;
  toName: string;
  y: number;
  self: boolean;
  label?: string;
  number?: string;
  dashed: boolean;
  startArrow: boolean;
  endArrow: boolean;
  color?: string;
}

export interface SeqBlockLayout {
  kind: BlockKind;
  label?: string;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  sections: { y: number; label?: string }[];
  color?: string;
}

export interface SequenceLayout {
  width: number;
  height: number;
  participants: SeqParticipantLayout[];
  messages: SeqMessageLayout[];
  activations: { x: number; y1: number; y2: number }[];
  blocks: SeqBlockLayout[];
  lifelineBottom: number;
}

const CONNECTORS: Record<string, { dashed: boolean; startArrow: boolean; endArrow: boolean }> = {
  '>': { dashed: false, startArrow: false, endArrow: true },
  '<': { dashed: false, startArrow: true, endArrow: false },
  '<>': { dashed: false, startArrow: true, endArrow: true },
  '-': { dashed: false, startArrow: false, endArrow: false },
  '--': { dashed: true, startArrow: false, endArrow: false },
  '-->': { dashed: true, startArrow: false, endArrow: true },
};

export function layoutSequence(diagram: SequenceDiagram, options: { measureText?: TextMeasurer; order?: string[] } = {}): SequenceLayout {
  const measure = options.measureText ?? estimateTextWidth;
  const label = { size: 12.5, weight: 400 };
  const head = { size: 14, weight: 500 };
  // Participants in declaration order, or the order the user dragged them into.
  const declared = [...diagram.participants.keys()];
  const names = options.order ? [...options.order.filter((n) => diagram.participants.has(n)), ...declared.filter((n) => !options.order!.includes(n))] : declared;
  const index = new Map(names.map((n, i) => [n, i]));

  // Column widths, then gaps wide enough for the labels between neighbours.
  const widths = names.map((n) => {
    const p = diagram.participants.get(n)!;
    return Math.max(120, Math.ceil(measure(p.label, head) + 32 + (p.properties.icon ? 26 : 0)));
  });
  const gaps = names.slice(1).map((_, i) => (widths[i]! + widths[i + 1]!) / 2 + 40);
  for (const e of diagram.events) {
    if (e.type !== 'message' || !e.label) continue;
    const a = index.get(e.from)!;
    const b = index.get(e.to)!;
    const w = measure(e.label, label) + 56;
    if (a === b) {
      if (a < gaps.length) gaps[a] = Math.max(gaps[a]!, w + 40);
      continue;
    }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const span = gaps.slice(lo, hi).reduce((s, g) => s + g, 0);
    if (span < w) for (let i = lo; i < hi; i++) gaps[i]! += (w - span) / (hi - lo);
  }
  const xs: number[] = [];
  names.forEach((_, i) => xs.push(i === 0 ? 24 + widths[0]! / 2 : xs[i - 1]! + gaps[i - 1]!));

  // Walk the events top to bottom.
  let y = TOP + HEADER_H + 30;
  const messages: SeqMessageLayout[] = [];
  const activations: SequenceLayout['activations'] = [];
  const openActivations = new Map<string, number[]>();
  const blocks = new Map<number, SeqBlockLayout & { columns: Set<number>; depth: number }>();
  const stack: number[] = [];
  const counters = [0];

  const touch = (column: number) => {
    for (const id of stack) blocks.get(id)!.columns.add(column);
  };

  for (const e of diagram.events) {
    if (e.type === 'message') {
      const a = index.get(e.from)!;
      const b = index.get(e.to)!;
      touch(a);
      touch(b);
      let number: string | undefined;
      if (diagram.settings.autoNumber !== 'off') {
        counters[counters.length - 1]! += 1;
        number = diagram.settings.autoNumber === 'nested' ? counters.join('.') : String(counters.reduce((s, c) => s + c, 0));
      }
      messages.push({ from: xs[a]!, to: xs[b]!, fromName: e.from, toName: e.to, y, self: a === b, label: e.label, number, color: e.properties.color, ...CONNECTORS[e.connector]! });
      y += a === b ? SELF_GAP : MESSAGE_GAP;
    } else if (e.type === 'activate') {
      const list = openActivations.get(e.participant) ?? [];
      list.push(y - MESSAGE_GAP / 2);
      openActivations.set(e.participant, list);
    } else if (e.type === 'deactivate') {
      const list = openActivations.get(e.participant);
      const start = list?.pop();
      if (start !== undefined) activations.push({ x: xs[index.get(e.participant)!]! + list!.length * 5, y1: start, y2: y - MESSAGE_GAP / 2 + 8 });
    } else if (e.type === 'block-start') {
      blocks.set(e.block, { kind: e.kind, label: e.label, x1: 0, x2: 0, y1: y - 12, y2: 0, sections: [], color: e.properties.color, columns: new Set(), depth: stack.length });
      stack.push(e.block);
      if (diagram.settings.autoNumber === 'nested') counters.push(0);
      y += BLOCK_HEADER;
    } else if (e.type === 'block-section') {
      blocks.get(e.block)!.sections.push({ y: y - 10, label: e.label });
      y += SECTION_GAP;
    } else if (e.type === 'block-end') {
      const block = blocks.get(e.block)!;
      block.y2 = y - 8;
      stack.pop();
      if (diagram.settings.autoNumber === 'nested') counters.pop();
      y += BLOCK_END;
    }
  }
  // Close anything left open at the bottom.
  for (const [name, list] of openActivations) for (const start of list) activations.push({ x: xs[index.get(name)!]!, y1: start, y2: y });

  const blockLayouts: SeqBlockLayout[] = [...blocks.values()].map((b) => {
    const cols = [...b.columns];
    const lo = cols.length ? Math.min(...cols) : 0;
    const hi = cols.length ? Math.max(...cols) : 0;
    const inset = 18 + (3 - Math.min(b.depth, 3)) * 8;
    return { kind: b.kind, label: b.label, x1: xs[lo]! - widths[lo]! / 2 + 4 - inset + 18, x2: xs[hi]! + widths[hi]! / 2 - 4 + inset - 18 + (messages.some((m) => m.self) ? 24 : 0), y1: b.y1, y2: b.y2 || y, sections: b.sections, color: b.color };
  });

  const participants = names.map((n, i) => ({ participant: diagram.participants.get(n)!, x: xs[i]!, width: widths[i]!, labelWidth: measure(diagram.participants.get(n)!.label, head) }));
  const lifelineBottom = y + 10;
  const right = Math.max(...participants.map((p) => p.x + p.width / 2), ...blockLayouts.map((b) => b.x2), ...messages.filter((m) => m.self).map((m) => m.from + 70));
  return { width: right + 24, height: lifelineBottom + 24, participants, messages, activations, blocks: blockLayouts, lifelineBottom };
}

export interface SequenceSvgProps {
  layout: SequenceLayout;
  theme: Theme;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Draw-in: how many participants, then messages, are shown; undefined shows all. */
  reveal?: number;
  /** Step-through: the message being explained; later ones dim, this one is accented. */
  current?: number | null;
  /** shadow (default) | plain | watercolor */
  styleMode?: string;
  /** The selected participant: its messages stay bright, the rest dims. */
  focus?: string | null;
  onSelect?: (participant: string) => void;
}

export function SequenceSvg({ layout, theme, icons, iconSet, reveal, current, styleMode, focus, onSelect }: SequenceSvgProps) {
  const watercolor = styleMode === 'watercolor';
  const shadow = styleMode !== 'plain' && !watercolor;
  const headTop = TOP;
  const shownMessages = reveal === undefined ? layout.messages.length : Math.max(0, reveal - layout.participants.length);
  const participants = reveal === undefined ? layout.participants : layout.participants.slice(0, reveal);
  // Blocks and activations appear once the messages inside them have.
  const lastY = shownMessages > 0 ? layout.messages[shownMessages - 1]!.y : -Infinity;
  const until = reveal === undefined ? Infinity : lastY + 30;
  const blocks = layout.blocks.filter((b) => b.y1 <= until);
  const activations = layout.activations.filter((a) => a.y1 <= until).map((a) => ({ ...a, y2: Math.min(a.y2, until) }));
  const step = (i: number) => {
    if (current != null) return i === current ? 'od-seq-current' : i > current ? 'od-dim' : undefined;
    const m = layout.messages[i]!;
    return focus && m.fromName !== focus && m.toName !== focus ? 'od-dim' : undefined;
  };
  return (
    <g fontFamily={theme.font.sans}>
      {watercolor && <WatercolorDefs />}
      {blocks.map((b, i) => {
        const color = b.color ? (swatchFor(theme, b.color)?.stroke ?? b.color) : theme.color.borderStrong;
        const tab = `${b.kind}${b.label ? ` ${b.label}` : ''}`;
        return (
          <g key={i}>
            <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} rx={theme.radius.md} fill={b.color ? (swatchFor(theme, b.color)?.groupFills[0] ?? 'none') : theme.group.fills[0]} fillOpacity={0.6} stroke={color} />
            <path d={`M${b.x1},${b.y1 + 22} H${b.x1 + Math.max(56, tab.length * 6.6 + 18)} l8,-8 V${b.y1}`} fill="none" stroke={color} />
            <text x={b.x1 + 8} y={b.y1 + 15} fontSize={11.5} fontWeight={600} fill={theme.color.text}>
              <tspan fontWeight={700}>{b.kind}</tspan>
              {b.label && <tspan fill={theme.color.textMuted}>{` ${b.label}`}</tspan>}
            </text>
            {b.sections.map((s, j) => (
              <g key={j}>
                <line x1={b.x1} x2={b.x2} y1={s.y} y2={s.y} stroke={color} strokeDasharray="5 4" />
                {s.label && (
                  <text x={b.x1 + 8} y={s.y + 15} fontSize={11.5} fill={theme.color.textMuted}>
                    {s.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
      {participants.map(({ participant, x }) => (
        <line key={`life-${participant.name}`} x1={x} x2={x} y1={headTop + HEADER_H} y2={layout.lifelineBottom} stroke={theme.color.borderStrong} strokeDasharray="5 5" />
      ))}
      {activations.map((a, i) => (
        <rect key={i} x={a.x - ACTIVATION_W / 2} y={a.y1} width={ACTIVATION_W} height={Math.max(8, a.y2 - a.y1)} rx={2} fill={theme.color.surface} stroke={theme.color.text} strokeWidth={1} />
      ))}
      {layout.messages.slice(0, shownMessages).map((m, i) => {
        const color = step(i) === 'od-seq-current' ? theme.color.accent : m.color ? (swatchFor(theme, m.color)?.ink ?? m.color) : theme.color.edge;
        const text = [m.number, m.label].filter(Boolean).join('. ');
        if (m.self) {
          const d = `M${m.from},${m.y} H${m.from + 44} V${m.y + 26} H${m.from + 6}`;
          return (
            <g key={i} className={step(i)}>
              <path d={d} fill="none" stroke={color} strokeWidth={theme.stroke.edge * 1.2} strokeDasharray={m.dashed ? '5 4' : undefined} />
              {m.endArrow && <Head x={m.from + 6} y={m.y + 26} dir={-1} color={color} />}
              {text && (
                <text x={m.from + 52} y={m.y + 16} fontSize={12.5} fill={theme.color.text}>
                  {text}
                </text>
              )}
            </g>
          );
        }
        const dir = m.to > m.from ? 1 : -1;
        return (
          <g key={i} className={step(i)} strokeWidth={step(i) === 'od-seq-current' ? 2 : undefined}>
            <line x1={m.from} x2={m.to - dir * 2} y1={m.y} y2={m.y} stroke={color} strokeWidth={theme.stroke.edge * 1.2} strokeDasharray={m.dashed ? '5 4' : undefined} />
            {m.endArrow && <Head x={m.to} y={m.y} dir={dir} color={color} />}
            {m.startArrow && <Head x={m.from} y={m.y} dir={-dir} color={color} />}
            {text && (
              <text x={(m.from + m.to) / 2} y={m.y - 8} fontSize={12.5} textAnchor="middle" fill={theme.color.text}>
                {text}
              </text>
            )}
          </g>
        );
      })}
      {participants.map(({ participant, x, width, labelWidth }) => {
        const swatch = swatchFor(theme, participant.properties.color);
        const icon = participant.properties.icon ? resolveIcon(participant.properties.icon, icons, iconSet) : undefined;
        const left = x - width / 2;
        // Icon and label centered together.
        const groupLeft = x - (labelWidth + (icon ? 26 : 0)) / 2;
        const textX = icon ? groupLeft + 26 + labelWidth / 2 : x;
        return (
          <g
            key={participant.name}
            data-node-id={participant.name}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation();
                    onSelect(participant.name);
                  }
                : undefined
            }
          >
            {shadow && <rect x={left + 4} y={headTop + 4} width={width} height={HEADER_H} rx={theme.radius.lg} fill={theme.shadow.shape.color} />}
            {watercolor && (
              <Wash color={swatch?.stroke ?? theme.node.stroke} theme={theme}>
                <rect x={left} y={headTop} width={width} height={HEADER_H} rx={theme.radius.lg} />
              </Wash>
            )}
            <rect x={left} y={headTop} width={width} height={HEADER_H} rx={theme.radius.lg} fill={watercolor ? 'none' : (swatch?.nodeFill ?? theme.node.fill)} stroke={focus === participant.name ? theme.color.accent : (swatch?.stroke ?? theme.node.stroke)} strokeWidth={focus === participant.name ? 2 : 1} strokeOpacity={watercolor && focus !== participant.name ? 0.45 : 1} />
            {icon && <Icon name={participant.properties.icon!} resolved={icon} x={groupLeft} y={headTop + HEADER_H / 2 - 10} size={20} tint={icon.tint ?? swatch?.icon ?? theme.node.icon} theme={theme} />}
            <text x={textX} y={headTop + HEADER_H / 2 + 5} fontSize={14} fontWeight={500} textAnchor="middle" fill={theme.color.text}>
              {participant.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Head({ x, y, dir, color }: { x: number; y: number; dir: number; color: string }) {
  return <polygon points={`${x},${y} ${x - dir * 8},${y - 4} ${x - dir * 8},${y + 4}`} fill={color} />;
}
