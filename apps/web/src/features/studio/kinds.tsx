import type { StudioKind, StudioSourceType, StudioStatus } from "@octonote/shared";
import {
  ChartColumnBig,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Loader2,
  Network,
  NotebookText,
  Paperclip,
  ScrollText,
  Shuffle,
  Type,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The same icons the editor's slash menu uses for these blocks. */
export const KIND_ICON: Record<StudioKind, LucideIcon> = {
  infographic: ChartColumnBig,
  mindmap: Network,
  flashcards: Layers,
  quiz: ClipboardCheck,
  mcq: ListChecks,
  matching: Shuffle,
  text: ScrollText,
};

export const SOURCE_ICON: Record<StudioSourceType, LucideIcon> = {
  text: Type,
  url: Globe,
  item: NotebookText,
  pdf: Paperclip,
};

export { FileText };

export function KindBadge({ kind, label }: { kind: StudioKind; label: string }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className="text-foreground inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: StudioStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        status === "succeeded" && "bg-foreground-strong text-background",
        status === "running" && "bg-muted text-foreground border",
        status === "failed" && "border-destructive/40 text-destructive border",
      )}
    >
      {status === "running" ? <Loader2 className="size-3 animate-spin" /> : null}
      {status === "failed" ? <CircleAlert className="size-3" /> : null}
      {status === "succeeded" ? "Ready" : status === "running" ? "Making" : "Failed"}
    </span>
  );
}

/** "just now", "5m ago", "3h ago", "Nov 12". */
export function since(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}
