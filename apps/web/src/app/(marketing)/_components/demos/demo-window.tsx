import { cn } from "@/lib/utils";

/** The app-window frame every feature demo sits in. Decorative: hidden from assistive tech. */
export function DemoWindow({
  title,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-card text-card-foreground relative overflow-hidden rounded-2xl border shadow-lg select-none",
        className,
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b px-4">
        <span className="flex gap-1.5">
          <span className="bg-border size-3 rounded-full" />
          <span className="bg-border size-3 rounded-full" />
          <span className="bg-border size-3 rounded-full" />
        </span>
        <span className="text-muted-foreground ml-3 truncate text-sm">{title}</span>
      </div>
      <div className={cn("relative", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Fade + rise into place when `show` turns true. */
export function Reveal({ show, children, className }: { show: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "ease-emphasized transition-all duration-500",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
