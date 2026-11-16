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
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3",
  cloud: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12l3 3 5-6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-5-5",
  flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  chat: "M4 5h16v11H9l-5 4z",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  warning: "M12 3l10 18H2zM12 10v5M12 18h.01",
  cart: "M3 4h2l2.5 11h11L21 7H6.5M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01",
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
