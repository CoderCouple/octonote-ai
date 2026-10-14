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
  footer,
  aura,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  points: FeaturePoint[];
  demo: React.ReactNode;
  /** Optional content under the points (e.g. setup steps). */
  footer?: React.ReactNode;
  /** Endel-style glow behind the section in dark mode. */
  aura?: boolean;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-16 overflow-hidden px-4 py-16 md:px-8 md:py-28", className)}>
      {aura ? <Aura /> : null}
      <div className="relative mx-auto max-w-7xl text-center">
        <p className="text-muted-foreground text-base font-medium md:text-lg">{eyebrow}</p>
        <h2 className="text-foreground-strong mt-3 text-[8vw] leading-[1.1] font-bold md:text-[min(4.5vw,4.5rem)] md:whitespace-nowrap">{title}</h2>
        <p className="text-muted-foreground mx-auto mt-5 max-w-3xl text-lg md:mt-6 md:text-xl">{body}</p>
      </div>
      <div className="relative mx-auto mt-10 max-w-7xl md:mt-16">{demo}</div>
      <div className="relative mx-auto mt-10 grid max-w-6xl gap-6 md:mt-16 md:grid-cols-3 md:gap-10">
        {points.map((p) => (
          <div key={p.title}>
            <h3 className="text-foreground-strong text-lg font-semibold md:text-xl">{p.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-base md:mt-2 md:text-lg">{p.body}</p>
          </div>
        ))}
      </div>
      {footer ? <div className="relative mx-auto mt-10 max-w-4xl md:mt-16">{footer}</div> : null}
    </section>
  );
}
