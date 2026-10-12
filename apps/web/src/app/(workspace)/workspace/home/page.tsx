import {
  ArrowRight,
  BookOpen,
  FileText,
  FolderKanban,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { accessOf, CreateButton, notebookLookup } from "@/features/library";
import { listCanvasesApi } from "@/features/canvas/api/canvases-api";
import { listNotebooksApi } from "@/features/notebooks/api/notebooks-api";
import { listNotesApi } from "@/features/notes/api/notes-api";
import { listProjectsApi } from "@/features/projects/api/projects-api";
import { RESOURCE_PATH, type ResourceKind } from "@/features/sharing";
import {
  getMeApi,
  listRecentApi,
} from "@/features/workspaces/api/workspaces-api";
import {
  ACCESS_LABEL,
  previewFromMarkdown,
  type Access,
} from "@octonote/shared";
import { cn } from "@/lib/utils";
import { activeWorkspaceId } from "../../_lib";

const PER_SECTION = 4;

/**
 * The items of one kind you edited most recently, newest first, each with
 * when you last edited it. Edits by other people don't count.
 */
function mineRecent<T extends { id: string }>(
  items: T[],
  lastEdit: Map<string, string>,
  kind: ResourceKind,
): (T & { editedAt: string })[] {
  return items
    .flatMap((item) => {
      const editedAt = lastEdit.get(`${kind}:${item.id}`);
      return editedAt ? [{ ...item, editedAt }] : [];
    })
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt))
    .slice(0, PER_SECTION);
}

/** Home: pick up where you left off — the latest notes, projects and notebooks. */
export default async function HomePage() {
  const workspaceId = await activeWorkspaceId();
  if (!workspaceId) return null;
  const [notes, canvases, projects, notebooks, recent, me] = await Promise.all([
    listNotesApi(workspaceId),
    listCanvasesApi(workspaceId),
    listProjectsApi(workspaceId),
    listNotebooksApi(workspaceId),
    listRecentApi(workspaceId),
    getMeApi(),
  ]);
  const lookup = notebookLookup(notebooks);
  const lastEdit = new Map(
    recent.map((r) => [`${r.kind}:${r.id}`, r.lastEditedAt] as const),
  );
  const firstName = me.user.name.split(" ")[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 lg:px-6">
      <header>
        <h1 className="text-foreground-strong text-3xl font-semibold tracking-tight">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Pick up where you left off.
        </p>
      </header>

      <Section
        title="Recent notes"
        href="/workspace/notes"
        empty="Notes you edit will show up here."
        create={
          <CreateButton
            kind="page"
            workspaceId={workspaceId}
            variant="outline"
          />
        }
      >
        {mineRecent(notes, lastEdit, "page").map((n) => (
          <RecentCard
            key={n.id}
            kind="page"
            id={n.id}
            title={n.title}
            editedAt={n.editedAt}
            access={accessOf(n, lookup(n.notebookId, n).notebook)}
            preview={
              <p className="text-muted-foreground line-clamp-4 self-start justify-self-stretch text-xs leading-relaxed">
                {previewFromMarkdown(n.contentMd, n.title, 220) || "Empty note"}
              </p>
            }
          />
        ))}
      </Section>

      <Section
        title="Recent canvases"
        href="/workspace/canvases"
        empty="Canvases you edit will show up here."
        create={
          <CreateButton
            kind="canvas"
            workspaceId={workspaceId}
            variant="outline"
          />
        }
      >
        {mineRecent(canvases, lastEdit, "canvas").map((c) => (
          <RecentCard
            key={c.id}
            kind="canvas"
            id={c.id}
            title={c.title}
            editedAt={c.editedAt}
            access={accessOf(c, lookup(c.notebookId, c).notebook)}
            fill
            preview={
              c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <LayoutGrid
                  aria-hidden
                  strokeWidth={1.25}
                  className="text-foreground-subtle size-12"
                />
              )
            }
          />
        ))}
      </Section>

      <Section
        title="Recent projects"
        href="/workspace/projects"
        empty="Projects you work on will show up here."
        create={
          <CreateButton
            kind="project"
            workspaceId={workspaceId}
            variant="outline"
          />
        }
      >
        {mineRecent(projects, lastEdit, "project").map((p) => (
          <RecentCard
            key={p.id}
            kind="project"
            id={p.id}
            title={p.name}
            editedAt={p.editedAt}
            access={accessOf(p, lookup(p.notebookId, p).notebook)}
            preview={<ProjectPreview description={p.description} />}
          />
        ))}
      </Section>

      <Section
        title="Recent notebooks"
        href="/workspace/notebooks"
        empty="Notebooks you work in will show up here."
        create={
          <CreateButton
            kind="notebook"
            workspaceId={workspaceId}
            variant="outline"
          />
        }
      >
        {mineRecent(notebooks, lastEdit, "notebook").map((nb) => (
          <RecentCard
            key={nb.id}
            kind="notebook"
            id={nb.id}
            title={nb.name}
            editedAt={nb.editedAt}
            access={accessOf(nb)}
            preview={
              <BookOpen
                aria-hidden
                strokeWidth={1.25}
                className="text-foreground-subtle size-12"
              />
            }
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  href,
  empty,
  create,
  children,
}: {
  title: string;
  href: string;
  empty: string;
  create: ReactNode;
  children: ReactNode[];
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-foreground-strong text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground-strong flex items-center gap-1 text-sm font-medium transition-colors"
        >
          View all
          <ArrowRight className="size-4" />
        </Link>
      </div>
      {children.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-6">
          <p className="text-muted-foreground text-sm">{empty}</p>
          {create}
        </div>
      )}
    </section>
  );
}

const KIND_ICON: Record<ResourceKind, typeof FileText> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};

function RecentCard({
  kind,
  id,
  title,
  editedAt,
  access,
  preview,
  fill = false,
}: {
  kind: ResourceKind;
  id: string;
  title: string;
  editedAt: string;
  access: Access;
  preview: ReactNode;
  /** The preview is an image that should fill the frame edge to edge. */
  fill?: boolean;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <Link
      href={RESOURCE_PATH[kind](id)}
      className="group bg-card hover:border-foreground-subtle flex flex-col overflow-hidden rounded-xl border transition-colors"
    >
      <div
        className={cn(
          "bg-muted/50 grid h-32 place-items-center overflow-hidden border-b",
          !fill && "px-4 py-3",
        )}
      >
        {preview}
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" />
          <span className="text-foreground-strong truncate font-semibold underline-offset-4 group-hover:underline">
            {title || "Untitled"}
          </span>
        </span>
        <span className="text-muted-foreground text-xs">
          {ACCESS_LABEL[access]} · You edited {formatDate(editedAt)}
        </span>
      </div>
    </Link>
  );
}

/** A note and a canvas side by side — what every project is. */
function ProjectPreview({ description }: { description: string | null }) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="bg-card flex h-14 w-11 flex-col gap-1 rounded-md border p-1.5">
          <span className="bg-foreground-subtle h-1 w-5 rounded-full" />
          <span className="bg-border h-0.5 w-full rounded-full" />
          <span className="bg-border h-0.5 w-full rounded-full" />
          <span className="bg-border h-0.5 w-3/4 rounded-full" />
        </span>
        <span className="bg-card relative h-14 w-16 rounded-md border">
          <span className="border-foreground-subtle absolute top-2 left-2 h-3 w-5 rounded-sm border" />
          <span className="border-foreground-subtle absolute right-2 bottom-2 size-4 rounded-full border" />
        </span>
      </div>
      {description ? (
        <p className="text-muted-foreground line-clamp-1 text-xs">
          {description}
        </p>
      ) : null}
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
