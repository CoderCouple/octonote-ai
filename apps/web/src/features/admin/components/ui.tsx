/** Small building blocks shared by the admin portal's pages. */
import { cn } from "@/lib/utils";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const fmtMoney = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );

export const fmtPercent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export const errorText = (err: unknown) =>
  err instanceof Error ? err.message.replace(/^Octonote API \S+ \d+(?: \[[A-Z_]+\])?: /, "") : "Something went wrong.";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-foreground-strong text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** `wide`: for pages built around a big table, which stretches to the window. */
export function PageBody({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-8 px-4 py-6 lg:px-8", wide ? "max-w-none" : "max-w-6xl")}>
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-foreground-strong text-base font-semibold">{title}</h2>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A labelled number; `tone` marks something that needs attention. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border px-4 py-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={cn(
          "text-foreground-strong text-xl font-semibold tabular-nums",
          tone === "warn" && "text-destructive",
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-muted-foreground truncate text-xs">{sub}</span> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

export function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card min-w-0 rounded-lg border p-4", className)}>
      {title ? <p className="text-foreground-strong mb-3 text-sm font-medium">{title}</p> : null}
      {children}
    </div>
  );
}

/** "+12% vs previous period" style change line. */
export function change(now: number, before: number): string {
  if (!before) return now ? "new this period" : "no change";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs previous period`;
}
