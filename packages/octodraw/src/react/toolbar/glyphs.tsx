import type { ReactNode } from 'react';
import type { ArrowHeadValue, LineValue } from './actions';

// Small line glyphs for the element toolbar (Lucide-style, 24px grid, currentColor).

function Glyph({ size = 18, children, fill = false }: { size?: number; children: ReactNode; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Caret = () => (
  <svg className="od-etb-caret" width="8" height="8" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const ShapeGlyph = () => <Glyph><path d="M12 3 21 12 12 21 3 12z" /></Glyph>;
export const IconGlyph = () => (
  <Glyph>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
  </Glyph>
);
export const BorderGlyph = () => <Glyph><rect x="3" y="5" width="18" height="14" rx="3" strokeDasharray="3 2.5" /></Glyph>;
export const MoreGlyph = () => (
  <Glyph fill>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </Glyph>
);
export const ReverseGlyph = () => <Glyph><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></Glyph>;
export const TrashGlyph = ({ size = 18 }: { size?: number }) => <Glyph size={size}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Glyph>;
export const LinkGlyph = () => <Glyph size={16}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Glyph>;
export const OpenGlyph = () => <Glyph size={16}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Glyph>;
export const UngroupGlyph = () => <Glyph size={16}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></Glyph>;
export const DescriptionGlyph = () => <Glyph size={16}><path d="M4 6h16M4 12h16M4 18h10" /></Glyph>;
export const CollapsedGlyph = () => <Glyph size={16}><rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" /></Glyph>;
export const SearchGlyph = () => (
  <Glyph size={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Glyph>
);

export function AlignGlyph({ align }: { align: 'left' | 'center' | 'right' }) {
  const d = align === 'left' ? 'M4 6h16M4 12h10M4 18h14' : align === 'right' ? 'M4 6h16M10 12h10M6 18h14' : 'M4 6h16M7 12h10M5 18h14';
  return <Glyph><path d={d} /></Glyph>;
}

/** Two lines of different weights: the arrow "Line" button. */
export const LineGlyph = () => (
  <svg width="22" height="18" viewBox="0 0 24 18" aria-hidden="true">
    <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" strokeWidth="1.5" />
    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

/** A 40px sample of a line style. */
export function LineSample({ style = 'solid', width = 2 }: { style?: LineValue; width?: number }) {
  const dash = style === 'dashed' ? '6 4' : style === 'dotted' ? '0.5 4.5' : undefined;
  return (
    <svg width="40" height="8" aria-hidden="true">
      <line x1="2" y1="4" x2="38" y2="4" stroke="currentColor" strokeWidth={width} strokeDasharray={dash} strokeLinecap={style === 'dotted' ? 'round' : undefined} />
    </svg>
  );
}

/** An arrowhead sample; `small` is the toolbar button size, otherwise the menu row size. */
export function HeadSample({ head, start = false, small = false }: { head: ArrowHeadValue; start?: boolean; small?: boolean }) {
  const w = small ? 22 : 36;
  const tip = w - 2;
  const shape =
    head === 'arrow' ? <path d={`M${tip - (small ? 7 : 9)} 2l${small ? 7 : 9} 5-${small ? 7 : 9} 5z`} fill="currentColor" />
    : head === 'open' ? <path d={`M${tip - 7} 2l7 5-7 5`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    : head === 'dot' ? <circle cx={tip - 3.5} cy="7" r="3.5" fill="currentColor" />
    : null;
  const end = head === 'arrow' ? tip - (small ? 6 : 8) : head === 'dot' ? tip - 4 : tip;
  return (
    <svg width={w} height="14" viewBox={`0 0 ${w} 14`} aria-hidden="true" style={start ? { transform: 'scaleX(-1)' } : undefined}>
      <line x1="2" y1="7" x2={end} y2="7" stroke="currentColor" strokeWidth="1.5" />
      {shape}
    </svg>
  );
}

/** Small outline of a DSL shape for the Shape menu. */
export function ShapeSample({ shape }: { shape: string }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  switch (shape) {
    case 'diamond':
      body = <path d="M12 3 21 12 12 21 3 12z" {...s} />;
      break;
    case 'ellipse':
      body = <ellipse cx="12" cy="12" rx="10" ry="7" {...s} />;
      break;
    case 'oval':
      body = <rect x="2" y="6" width="20" height="12" rx="6" {...s} />;
      break;
    case 'circle':
      body = <circle cx="12" cy="12" r="9" {...s} />;
      break;
    case 'cylinder':
      body = (
        <g {...s}>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        </g>
      );
      break;
    case 'document':
      body = <path d="M3 5h18v13c-3-2-6 2-9 0s-6 2-9 0z" {...s} />;
      break;
    case 'hexagon':
      body = <path d="M7 4h10l5 8-5 8H7l-5-8z" {...s} />;
      break;
    case 'parallelogram':
      body = <path d="M7 5h15l-5 14H2z" {...s} />;
      break;
    case 'star':
      body = <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" {...s} />;
      break;
    case 'trapezoid':
      body = <path d="M6 5h12l4 14H2z" {...s} />;
      break;
    case 'triangle':
      body = <path d="M12 3 22 20H2z" {...s} />;
      break;
    default:
      body = <rect x="3" y="5" width="18" height="14" rx="2" {...s} />;
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  );
}
