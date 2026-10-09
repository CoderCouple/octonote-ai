"use client";

/**
 * The list screen for notes, canvases, projects, notebooks and Shared:
 * four stat cards, access tabs with counts, sort, a table and pagination.
 * Pure white surfaces (Notion-style); structure comes from hairline borders.
 */
import {
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FolderInput,
  FolderKanban,
  Globe,
  LayoutGrid,
  Link2,
  Lock,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { AnalyticsSheet } from "@/features/analytics";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  KIND_LABEL,
  RESOURCE_PATH,
  type ResourceKind,
} from "@/features/sharing";
import { libraryStats, type Access } from "@octonote/shared";
import { cn } from "@/lib/utils";
import { deleteResource, moveResource } from "../operations";
import { DELETE_COPY } from "./resource-list";
import { MoveToNotebookDialog } from "./move-to-notebook-dialog";

export type { Access };

export interface LibraryRow {
  kind: ResourceKind;
  id: string;
  title: string;
  /** Muted line under the name: a content preview, a description… */
  subtitle?: string;
  thumbnailUrl?: string | null;
  notebookId?: string | null;
  notebookName?: string | null;
  access: Access;
  /** Set when public only because its notebook is published. */
  publishedVia?: string | null;
  sharedCount: number;
  owner: string | null;
  createdAt: string;
  updatedAt: string;
  /** Shared page: the viewer's role instead of the item's access. */
  roleLabel?: string;
}

type Filter = "all" | "private" | "shared" | "public";
type SortKey = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "updated-desc", label: "Updated (newest)" },
  { key: "updated-asc", label: "Updated (oldest)" },
  { key: "name-asc", label: "Name (A → Z)" },
  { key: "name-desc", label: "Name (Z → A)" },
];

const KIND_ICON: Record<ResourceKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

const ACCESS: Record<Access, { label: string; icon: typeof Lock }> = {
  public: { label: "Published", icon: Globe },
  link: { label: "Anyone with link", icon: Link2 },
  shared: { label: "Shared", icon: Users },
  private: { label: "Private", icon: Lock },
};

function matches(row: LibraryRow, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "public") return row.access === "public";
  if (filter === "shared")
    return row.access === "shared" || row.access === "link";
  return row.access === "private";
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

interface LibraryTableProps {
  workspaceId: string;
  rows: LibraryRow[];
  /** Plural noun for counts and copy, e.g. "notes". */
  noun: string;
  emptyMessage: string;
  /** Usually a CreateButton. */
  createAction?: ReactNode;
  /** Shared page: open-only rows, "Your access" column, no notebook/owner tabs. */
  readOnly?: boolean;
  /** Notebooks can't sit in a notebook, so their page hides that column. */
  hideNotebookColumn?: boolean;
}

export function LibraryTable({
  workspaceId,
  rows,
  noun,
  emptyMessage,
  createAction,
  readOnly = false,
  hideNotebookColumn = false,
}: LibraryTableProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated-desc");
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);

  const counts = useMemo(
    () => ({
      all: rows.length,
      private: rows.filter((r) => matches(r, "private")).length,
      shared: rows.filter((r) => matches(r, "shared")).length,
      public: rows.filter((r) => matches(r, "public")).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const list = rows.filter((r) => matches(r, filter));
    const by = {
      "updated-desc": (a: LibraryRow, b: LibraryRow) =>
        b.updatedAt.localeCompare(a.updatedAt),
      "updated-asc": (a: LibraryRow, b: LibraryRow) =>
        a.updatedAt.localeCompare(b.updatedAt),
      "name-asc": (a: LibraryRow, b: LibraryRow) =>
        (a.title || "Untitled").localeCompare(b.title || "Untitled"),
      "name-desc": (a: LibraryRow, b: LibraryRow) =>
        (b.title || "Untitled").localeCompare(a.title || "Untitled"),
    }[sortKey];
    return [...list].sort(by);
  }, [rows, filter, sortKey]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(pageIndex, pageCount - 1);
  const pageRows = visible.slice(page * pageSize, page * pageSize + pageSize);
  const setFilterAndReset = (f: Filter) => {
    setFilter(f);
    setPageIndex(0);
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
      {readOnly ? null : <StatCards rows={rows} noun={noun} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {readOnly ? (
          <p className="text-muted-foreground text-sm">
            {rows.length} item{rows.length === 1 ? "" : "s"} shared with you
          </p>
        ) : (
          <div
            role="tablist"
            aria-label="Filter by access"
            className="flex items-center gap-1"
          >
            {(
              [
                ["all", "All"],
                ["private", "Private"],
                ["shared", "Shared"],
                ["public", "Published"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilterAndReset(key)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                  filter === key
                    ? "text-foreground-strong bg-accent"
                    : "text-muted-foreground hover:text-foreground-strong hover:bg-accent/60",
                )}
              >
                {label}
                <span
                  className={cn(
                    "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs tabular-nums",
                    filter === key
                      ? "bg-foreground-strong text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpDown className="size-3.5" />
                <span className="hidden sm:inline">
                  {SORTS.find((s) => s.key === sortKey)?.label}
                </span>
                <span className="sm:hidden">Sort</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {SORTS.map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  onSelect={() => setSortKey(s.key)}
                  className={cn(sortKey === s.key && "bg-accent font-medium")}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {createAction}
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground h-11 pl-4 font-medium">
                  Name
                </TableHead>
                <TableHead className="text-muted-foreground font-medium">
                  {readOnly ? "Your access" : "Access"}
                </TableHead>
                {readOnly ? null : (
                  <>
                    {hideNotebookColumn ? null : (
                      <TableHead className="text-muted-foreground hidden font-medium md:table-cell">
                        Notebook
                      </TableHead>
                    )}
                    <TableHead className="text-muted-foreground hidden font-medium lg:table-cell">
                      Owner
                    </TableHead>
                    <TableHead className="text-muted-foreground hidden font-medium lg:table-cell">
                      Shared with
                    </TableHead>
                  </>
                )}
                <TableHead className="text-muted-foreground font-medium">
                  {readOnly ? "Shared" : "Updated"}
                </TableHead>
                <TableHead className="w-36 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="text-muted-foreground h-32 text-center text-sm"
                  >
                    {rows.length === 0
                      ? emptyMessage
                      : `No ${noun} match this filter.`}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <Row
                    key={`${row.kind}:${row.id}`}
                    row={row}
                    workspaceId={workspaceId}
                    readOnly={readOnly}
                    showNotebook={!hideNotebookColumn}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <p className="text-muted-foreground">
          {visible.length} of {rows.length} {noun}
        </p>
        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-2 lg:flex">
            <span className="font-medium">Rows per page</span>
            <Select
              value={`${pageSize}`}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-20"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 50].map((n) => (
                  <SelectItem key={n} value={`${n}`}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="font-medium">
            Page {page + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <PagerButton
              label="First page"
              onClick={() => setPageIndex(0)}
              disabled={page === 0}
              className="hidden lg:flex"
            >
              <ChevronsLeft className="size-4" />
            </PagerButton>
            <PagerButton
              label="Previous page"
              onClick={() => setPageIndex(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="size-4" />
            </PagerButton>
            <PagerButton
              label="Next page"
              onClick={() => setPageIndex(page + 1)}
              disabled={page >= pageCount - 1}
            >
              <ChevronRight className="size-4" />
            </PagerButton>
            <PagerButton
              label="Last page"
              onClick={() => setPageIndex(pageCount - 1)}
              disabled={page >= pageCount - 1}
              className="hidden lg:flex"
            >
              <ChevronsRight className="size-4" />
            </PagerButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  className,
  ...props
}: {
  label: string;
  className?: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("size-8", className)}
      aria-label={label}
      {...props}
    />
  );
}

/* ───────────── Stat cards ───────────── */

function StatCards({ rows, noun }: { rows: LibraryRow[]; noun: string }) {
  const tiles = libraryStats(rows, noun);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => {
        const Trend = t.up ? TrendingUp : TrendingDown;
        return (
          <div
            key={t.label}
            className="bg-card rounded-xl border p-5 shadow-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-muted-foreground text-sm">{t.label}</p>
              <span className="text-foreground flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums">
                <Trend className="size-3" />
                {t.badge}
              </span>
            </div>
            <p className="text-foreground-strong mt-1 text-3xl font-semibold tabular-nums">
              {t.value.toLocaleString()}
            </p>
            <p className="text-foreground-strong mt-5 flex items-center gap-1.5 text-sm font-medium">
              {t.bold}
              <Trend className="size-3.5" />
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{t.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Rows ───────────── */

function Row({
  row,
  workspaceId,
  readOnly,
  showNotebook,
}: {
  row: LibraryRow;
  workspaceId: string;
  readOnly: boolean;
  showNotebook: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moving, setMoving] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const Icon = KIND_ICON[row.kind];
  const href = RESOURCE_PATH[row.kind](row.id);
  const access = ACCESS[row.access];

  async function remove() {
    try {
      await deleteResource(row.kind, row.id);
      toast.success(`Deleted ${KIND_LABEL[row.kind]}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  }

  return (
    <TableRow className="group">
      <TableCell className="max-w-0 py-3 pl-4 sm:w-[38%]">
        <Link href={href} className="flex min-w-0 items-center gap-3">
          <span className="bg-muted grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border">
            {row.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Icon className="text-muted-foreground size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="text-foreground-strong block truncate font-semibold underline-offset-4 group-hover:underline">
              {row.title || "Untitled"}
            </span>
            {row.subtitle ? (
              <span className="text-muted-foreground block truncate text-xs">
                {row.subtitle}
              </span>
            ) : null}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        {row.roleLabel ? (
          <Pill icon={Users}>{row.roleLabel}</Pill>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Pill icon={access.icon} strong={row.access === "public"}>
                  {access.label}
                </Pill>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {row.publishedVia
                ? `Published via ${row.publishedVia}`
                : row.access === "shared"
                  ? `Shared with ${row.sharedCount} ${row.sharedCount === 1 ? "person" : "people"}`
                  : row.access === "link"
                    ? "Anyone with the link can open it"
                    : row.access === "public"
                      ? "Published to the web"
                      : "Only you and your workspace"}
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      {readOnly ? null : (
        <>
          {showNotebook ? (
            <TableCell className="text-muted-foreground hidden md:table-cell">
              {row.notebookName ? (
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5" />
                  <span className="max-w-40 truncate">{row.notebookName}</span>
                </span>
              ) : (
                "—"
              )}
            </TableCell>
          ) : null}
          <TableCell className="hidden lg:table-cell">
            {row.owner ? (
              <span className="flex items-center gap-2">
                <span className="bg-muted text-muted-foreground grid size-6 place-items-center rounded-full border text-[10px] font-semibold uppercase">
                  {initials(row.owner)}
                </span>
                <span className="max-w-36 truncate">{row.owner}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell className="text-muted-foreground hidden tabular-nums lg:table-cell">
            {row.sharedCount > 0
              ? `${row.sharedCount} ${row.sharedCount === 1 ? "person" : "people"}`
              : "—"}
          </TableCell>
        </>
      )}
      <TableCell className="text-muted-foreground tabular-nums">
        {formatDate(row.updatedAt)}
      </TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-0.5">
          <IconAction label="Open" href={href}>
            <ArrowUpRight className="size-3.5" />
          </IconAction>
          {readOnly ? null : (
            <>
              <IconAction
                label="Analytics"
                onClick={() => setAnalyticsOpen(true)}
              >
                <BarChart3 className="size-3.5" />
              </IconAction>
              {row.kind !== "notebook" ? (
                <IconAction
                  label="Move to notebook"
                  onClick={() => setMoving(true)}
                >
                  <FolderInput className="size-3.5" />
                </IconAction>
              ) : null}
              <IconAction
                label="Delete"
                onClick={() => setConfirmDelete(true)}
                destructive
              >
                <Trash2 className="size-3.5" />
              </IconAction>
            </>
          )}
        </div>
        <AnalyticsSheet
          target={
            analyticsOpen
              ? {
                  kind: row.kind,
                  id: row.id,
                  title: row.title,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                  accessLabel: row.publishedVia
                    ? `Published via ${row.publishedVia}`
                    : access.label,
                }
              : null
          }
          onOpenChange={setAnalyticsOpen}
        />
        <ConfirmActionDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete “${row.title || "Untitled"}”?`}
          description={DELETE_COPY[row.kind]}
          onConfirm={remove}
        />
        {row.kind !== "notebook" && !readOnly ? (
          <MoveToNotebookDialog
            open={moving}
            onOpenChange={setMoving}
            workspaceId={workspaceId}
            currentNotebookId={row.notebookId ?? null}
            onMove={async (notebookId) => {
              if (row.kind === "notebook") return;
              await moveResource(row.kind, row.id, notebookId);
              toast.success(
                notebookId
                  ? "Moved to notebook."
                  : "Moved out of the notebook.",
              );
              router.refresh();
            }}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function Pill({
  icon: Icon,
  strong,
  children,
}: {
  icon: typeof Lock;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        strong
          ? "bg-foreground-strong text-background border-transparent"
          : "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {children}
    </span>
  );
}

function IconAction({
  label,
  href,
  onClick,
  destructive,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  const className = cn(
    "text-muted-foreground size-7",
    destructive ? "hover:text-destructive" : "hover:text-foreground-strong",
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Button asChild variant="ghost" size="icon" className={className}>
            <Link href={href} aria-label={label}>
              {children}
            </Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            onClick={onClick}
            aria-label={label}
          >
            {children}
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}
