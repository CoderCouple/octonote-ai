import {
  OCTOPUS_BODY,
  OCTOPUS_FACES,
  OCTOPUS_PULSE_CSS,
  OCTOPUS_VIEWBOX,
  type OctopusMood,
} from "@octonote/shared";

/**
 * The Octonote octopus (packages/shared/src/octopus.ts). The body takes the
 * text colour (`text-foreground-strong`: black in light mode, white in dark);
 * the face is cut out in `paper`, the colour of the surface it sits on.
 */
export function OctopusMark({
  mood = "happy",
  className,
  paper = "var(--background)",
  title,
}: {
  mood?: OctopusMood;
  className?: string;
  /** The surface behind the mark, e.g. `var(--sidebar)` or `var(--popover)`. */
  paper?: string;
  /** Accessible name; omit when the mark sits next to its name. */
  title?: string;
}) {
  return (
    <svg
      viewBox={OCTOPUS_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {mood === "waiting" ? <style>{OCTOPUS_PULSE_CSS}</style> : null}
      <path fill="currentColor" d={OCTOPUS_BODY} />
      {OCTOPUS_FACES[mood].map((p, i) =>
        p.kind === "rect" ? (
          <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={paper} />
        ) : p.kind === "circle" ? (
          <circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={paper}
            className={p.pulse !== undefined ? `octo-p${p.pulse}` : undefined}
          />
        ) : (
          <path key={i} d={p.d} fill="none" stroke={paper} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" />
        ),
      )}
    </svg>
  );
}
