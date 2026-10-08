import { cn } from "@/lib/utils";
import { Aura } from "./aura";

export interface FeaturePoint {
  title: string;
  body: string;
}

/**
 * One feature per section: a large centered headline, the feature's live
 * demo at full width, then its key points in a row underneath.
 */
export function FeatureSection({
  id,
  eyebrow,
  title,
  body,
  points,
  demo,
  aura,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  points: FeaturePoint[];
  demo: React.ReactNode;
  /** Endel-style glow behind the section in dark mode. */
  aura?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-16 overflow-hidden px-4 py-32 md:px-8 md:py-48", className)}>
      {aura ? <Aura /> : null}
      <div className="relative mx-auto max-w-7xl text-center">
        <p className="text-muted-foreground text-lg font-medium md:text-xl">{eyebrow}</p>
        <h2 className="text-foreground-strong mt-5 text-5xl font-bold md:text-[min(4.5vw,4.5rem)] md:whitespace-nowrap">{title}</h2>
        <p className="text-muted-foreground mx-auto mt-8 max-w-3xl text-xl md:text-2xl">{body}</p>
      </div>
      <div className="relative mx-auto mt-20 max-w-7xl md:mt-24">{demo}</div>
      <div className="relative mx-auto mt-20 grid max-w-6xl gap-12 md:mt-24 md:grid-cols-3">
        {points.map((p) => (
          <div key={p.title}>
            <h3 className="text-foreground-strong text-xl font-semibold md:text-2xl">{p.title}</h3>
            <p className="text-muted-foreground mt-3 text-lg md:text-xl">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
