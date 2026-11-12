import type { IconName } from "./schema.js";

/** Simple 24×24 stroke icons, drawn in the current colour. */
const PATHS: Record<IconName, string> = {
  car: "M5 17h14M6 17v2M18 17v2M4 13l2-5h12l2 5M4 13h16v4H4zM7.5 15h.01M16.5 15h.01",
  bike: "M5.5 17.5a3 3 0 1 0 0-.01M18.5 17.5a3 3 0 1 0 0-.01M5.5 17.5L9 10h6l3.5 7.5M12 17.5L9 10M14 6h2l-1 4",
  walk: "M13 4.5a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M9 12l2-4 4 2 2 3M11 8l-1 5",
  plane: "M2 16l20-7-4 9-6-3-4 4v-5l10-6",
  rocket: "M12 3c3 2 5 6 4 11h-8C7 9 9 5 12 3zM8 14l-3 3 4 1M16 14l3 3-4 1M10 18l2 3 2-3M12 9h.01",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5",
  drop: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z",
  leaf: "M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19c3-4 6-7 10-9",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  home: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
