/**
 * Endel-style ambient light for the dark theme: two soft blobs drifting
 * slowly over a fine grain. Driven by the --aura-* tokens, which are
 * transparent in light mode, so Notion-white stays clean.
 */
export function Aura() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <div
        className="animate-aura-drift absolute -top-1/4 left-1/2 h-[70vmax] w-[70vmax] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--aura-1) 0%, transparent 62%)" }}
      />
      <div
        className="animate-aura-drift absolute top-1/3 -left-1/4 h-[55vmax] w-[55vmax] rounded-full blur-3xl [animation-delay:-14s]"
        style={{ background: "radial-gradient(circle, var(--aura-2) 0%, transparent 60%)" }}
      />
      <div
        className="absolute inset-0 hidden opacity-[0.07] mix-blend-overlay dark:block"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
