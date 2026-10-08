/**
 * Endel-inspired zen orb backdrop for the auth pages.
 *
 * - Glossy spherical orb anchored above the card with the brand mark inside.
 * - Rippling rings expand outward from the orb edge.
 * - Twinkling stars scattered across the viewport, each with random delay and duration.
 * - Shooting stars streak diagonally at staggered intervals.
 *
 * All colors driven by --orb-* CSS custom properties defined in globals.css,
 * so the look adapts to both light and dark themes. Strictly monochrome.
 *
 * Star positions use a seeded PRNG so SSR and client render the same DOM,
 * avoiding any hydration mismatch despite the "random" placement.
 */

import { Focus } from "lucide-react";

const ORB_TOP = 200;
const ORB_SIZE = 280;

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface TwinkleStar {
  top: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
}

const STARS: TwinkleStar[] = (() => {
  const rand = seededRandom(0xfac3);
  return Array.from({ length: 95 }, () => ({
    top: rand() * 100, // %
    left: rand() * 100, // %
    size: 1 + rand() * 1.8, // px
    delay: rand() * 6, // s
    duration: 2.5 + rand() * 4, // s
  }));
})();

interface ShootingStar {
  top: number; // % from top, start position
  startLeft: number; // % from left
  delay: number; // s
  duration: number; // s
  length: number; // px
}

const SHOOTING_STARS: ShootingStar[] = [
  { top: 12, startLeft: -8, delay: 0, duration: 4.5, length: 220 },
  { top: 28, startLeft: -8, delay: 3.7, duration: 5.5, length: 280 },
  { top: 48, startLeft: -8, delay: 9.4, duration: 5, length: 240 },
  { top: 68, startLeft: -8, delay: 14.6, duration: 6, length: 300 },
  { top: 84, startLeft: -8, delay: 21.2, duration: 5.5, length: 260 },
];

interface AuthBackdropProps {
  showOrb?: boolean;
  /** Twinkling starfield behind everything. Default true. */
  showStars?: boolean;
  /** Diagonal shooting-star streaks. Default true. */
  showShootingStars?: boolean;
  /**
   * Vertical position of the orb's centre inside the backdrop's container.
   * Accepts any CSS length or percentage. Defaults to `200px` (the value used
   * by the invite / centred-card layouts). Pass `"50%"` to centre the orb in
   * a full-height column such as the login / signup split layout.
   */
  orbTop?: number | string;
  /**
   * Diameter of the orb in pixels. Ripple rings, atmospheric glow, and inner
   * Focus icon all scale proportionally. Defaults to `280` (the viewport-hero
   * size used by invite / marketing). Pass `140`–`180` for embedded contexts
   * like a login card's right column.
   */
  orbSize?: number;
}

export function AuthBackdrop({
  showOrb = true,
  showStars = true,
  showShootingStars = true,
  orbTop = ORB_TOP,
  orbSize = ORB_SIZE,
}: AuthBackdropProps = {}) {
  const glowSize = Math.round(orbSize * (820 / ORB_SIZE));
  const iconSize = Math.round(orbSize * (64 / ORB_SIZE));
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ background: "var(--orb-page)" }}
    >
      {/* Twinkling stars */}
      {showStars && (
        <div aria-hidden className="absolute inset-0">
          {STARS.map((s, i) => (
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
        </div>
      )}

      {/* Shooting stars — tapered trail with a bright glowing head */}
      {showShootingStars && (
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          {SHOOTING_STARS.map((s, i) => (
            <span
              key={i}
              className="animate-octo-shoot absolute block origin-left"
              style={{
                top: `${s.top}%`,
                left: `${s.startLeft}%`,
                width: `${s.length}px`,
                height: "6px",
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
              }}
            >
              {/* Trail */}
              <span
                className="absolute top-1/2 left-0 block h-px w-full -translate-y-1/2"
                style={{
                  background:
                    "linear-gradient(to right, transparent, var(--orb-grain) 92%, var(--orb-grain) 100%)",
                  filter: "blur(0.3px)",
                }}
              />
              {/* Head — bright glowing tip at the leading edge */}
              <span
                className="absolute top-1/2 right-0 block -translate-y-1/2 rounded-full"
                style={{
                  width: "5px",
                  height: "5px",
                  background: "var(--orb-grain)",
                  boxShadow:
                    "0 0 6px 1px var(--orb-grain), 0 0 14px 3px var(--orb-glow-soft)",
                }}
              />
            </span>
          ))}
        </div>
      )}

      {showOrb && (
        <>
          {/* Rippling rings — the `octo-ripple` keyframes already carry
              `translate(-50%, -50%)` for centring, so we must NOT stack
              Tailwind's separate `translate` property on top or we'd get a
              double shift. */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              aria-hidden
              className="animate-octo-ripple absolute left-1/2 rounded-full"
              style={{
                top: orbTop,
                height: orbSize,
                width: orbSize,
                border: "1px solid var(--orb-ripple)",
                animationDelay: `${i * 0.625}s`,
              }}
            />
          ))}

          {/* Outer atmospheric glow — same rule, `octo-pulse` keyframes
              provide the translate. */}
          <div
            aria-hidden
            className="animate-octo-pulse absolute left-1/2 rounded-full"
            style={{
              top: orbTop,
              height: glowSize,
              width: glowSize,
              background:
                "radial-gradient(circle at 50% 45%, var(--orb-glow) 0%, var(--orb-glow-soft) 32%, transparent 60%)",
              filter: "blur(8px)",
            }}
          />

          {/* The orb itself */}
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              top: orbTop,
              height: orbSize,
              width: orbSize,
              background: "var(--orb-fill)",
              boxShadow:
                "inset 0 0 0 1.5px var(--orb-rim), inset 0 -50px 70px rgba(0,0,0,0.7), 0 0 80px 12px var(--orb-glow)",
            }}
          >
            <Focus
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              strokeWidth={1.5}
              style={{ color: "var(--orb-icon)", width: iconSize, height: iconSize }}
              aria-hidden
            />
          </div>
        </>
      )}
    </div>
  );
}
