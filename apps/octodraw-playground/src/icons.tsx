// Small inline UI icons (Lucide paths, ISC) for the playground chrome.
const PATHS = {
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  columns: 'M3 3h18v18H3zM12 3v18',
  canvas: 'M3 3h18v18H3z',
  sun: 'M12 3v1M12 20v1M4.2 4.2l.7.7M19.1 19.1l.7.7M3 12h1M20 12h1M4.2 19.8l.7-.7M19.1 4.9l.7-.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  panelClose: 'M3 3h18v18H3zM9 3v18M16 15l-3-3 3-3',
  chevronDown: 'M6 9l6 6 6-6',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  stop: 'M6 6h12v12H6z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check: 'M5 12.5l4.5 4.5L19 7',
} as const;

export type IconName = keyof typeof PATHS;

export function UiIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
