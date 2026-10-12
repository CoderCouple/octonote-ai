/**
 * Top bar for the focus screens (note, canvas, project, notebook): back +
 * type icon + title on the left (title shrinks with "…"), tools and Share on
 * the right. 48px — the same as the workspace top bar and sidebar header, so
 * their bottom borders line up.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function FocusHeader({
  leading,
  icon: Icon,
  title,
  center,
  children,
}: {
  /** Back / home link (hidden inside the mobile app). */
  leading?: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
  /** Optional centred control (the project's layout switch). */
  center?: ReactNode;
  /** Right-hand tools; put Share last. */
  children?: ReactNode;
}) {
  return (
    <header className="bg-background relative flex h-12 shrink-0 items-center gap-2 border-b px-2.5 md:px-3">
      {leading}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        {title}
      </div>
      {/* Truly centred on wider screens; inline (still available) on phones. */}
      {center ? <div className="shrink-0 sm:absolute sm:left-1/2 sm:-translate-x-1/2">{center}</div> : null}
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </header>
  );
}
