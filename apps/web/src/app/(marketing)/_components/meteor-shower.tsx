/**
 * Meteor shower: a twinkling starfield with diagonal shooting stars, ported from
 * the prior app's auth backdrop. Monochrome — dots and trails use --orb-grain /
 * --orb-glow-soft, so they're soft black on white and soft white on night.
 * Animations (octo-twinkle / octo-shoot in globals.css) stop under
 * prefers-reduced-motion; the shooting stars start off-screen, so they simply
 * never appear.
 *
 * Positions come from a seeded PRNG so server and client render the same DOM.
 */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const STARS = (() => {
  const rand = seededRandom(0xfac3);
  return Array.from({ length: 95 }, () => ({
    top: rand() * 100, // %
    left: rand() * 100, // %
    size: 1 + rand() * 1.8, // px
    delay: rand() * 6, // s
    duration: 2.5 + rand() * 4, // s
  }));
})();

const METEORS = [
  { top: 6, delay: 0, duration: 4.5, length: 220 },
  { top: 22, delay: 3.7, duration: 5.5, length: 280 },
  { top: 40, delay: 9.4, duration: 5, length: 240 },
  { top: 58, delay: 14.6, duration: 6, length: 300 },
  { top: 74, delay: 21.2, duration: 5.5, length: 260 },
];

export function MeteorShower({ stars = 95 }: { stars?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
    >
      {STARS.slice(0, stars).map((s, i) => (
        <span
          key={i}
          className="animate-octo-twinkle absolute rounded-full"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: "var(--orb-grain)",
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            boxShadow: `0 0 ${s.size * 2}px var(--orb-grain)`,
          }}
        />
      ))}

      {METEORS.map((m, i) => (
        <span
          key={i}
          className="animate-octo-shoot absolute block origin-left"
          style={{
            top: `${m.top}%`,
            left: "-8%",
            width: `${m.length}px`,
            height: "6px",
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        >
          {/* Tapered trail */}
          <span
            className="absolute top-1/2 left-0 block h-px w-full -translate-y-1/2"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--orb-grain) 92%, var(--orb-grain) 100%)",
              filter: "blur(0.3px)",
            }}
          />
          {/* Glowing head */}
          <span
            className="absolute top-1/2 right-0 block size-[5px] -translate-y-1/2 rounded-full"
            style={{
              background: "var(--orb-grain)",
              boxShadow:
                "0 0 6px 1px var(--orb-grain), 0 0 14px 3px var(--orb-glow-soft)",
            }}
          />
        </span>
      ))}
    </div>
  );
}
