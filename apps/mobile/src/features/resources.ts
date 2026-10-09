/**
 * The four resource kinds as the mobile lists see them, and the API calls
 * behind create / list / delete. Mirrors the web app's library feature.
 */
import { accessOf, previewFromMarkdown, type Access, type ResourceKind } from "@octonote/shared";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { api } from "@/lib/api";

export type { Access, ResourceKind };

export interface ListItem {
  kind: ResourceKind;
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string | null;
  /** Who can open it (undefined on the Shared tab). */
  access?: Access;
  /** Name of the notebook it's in, if any. */
  notebookName?: string | null;
  /** True when it's public only because its notebook is published. */
  publishedViaNotebook?: boolean;
  owner?: string | null;
  sharedCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface MeResponse {
  user: { id: string; name: string; email: string };
  memberships: { workspace: { id: string; name: string } }[];
}

/** Route for a resource's screen. Same shape as the web app's URLs. */
export const ROUTE = {
  page: (id: string) => `/n/${id}` as const,
  canvas: (id: string) => `/c/${id}` as const,
  project: (id: string) => `/p/${id}` as const,
  notebook: (id: string) => `/nb/${id}` as const,
} satisfies Record<ResourceKind, (id: string) => Href>;

export const LABEL: Record<ResourceKind, { one: string; many: string }> = {
  page: { one: "note", many: "Notes" },
  canvas: { one: "canvas", many: "Canvases" },
  project: { one: "project", many: "Projects" },
  notebook: { one: "notebook", many: "Notebooks" },
};

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<MeResponse>("/me"), staleTime: 5 * 60_000 });
}

/** Mobile v1 uses the first workspace; switching lives on web for now. */
export function useWorkspaceId(): string | undefined {
  return useMe().data?.memberships[0]?.workspace.id;
}

type Row = Record<string, unknown> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  notebookId?: string | null;
  linkAccess: "restricted" | "anyone_with_link";
  publishedAt: string | null;
  sharedCount?: number;
};

function snippet(md: unknown, title: string): string | undefined {
  return typeof md === "string" ? previewFromMarkdown(md, title, 120) || undefined : undefined;
}

interface NotebookInfo {
  name: string;
  publishedAt: string | null;
}

function toItem(kind: ResourceKind, r: Row, notebooks: Map<string, NotebookInfo>, owner?: string | null): ListItem {
  const nb = r.notebookId ? notebooks.get(r.notebookId) : undefined;
  const notebook = nb ? { publishedAt: nb.publishedAt } : null;
  const creator = r.creator as { name: string } | null | undefined;
  return {
    kind,
    id: r.id,
    title: String(r.title ?? r.name ?? "") || "Untitled",
    subtitle: kind === "page" ? snippet(r.contentMd, String(r.title ?? "")) : kind === "project" ? ((r.description as string) ?? "Note + canvas") : undefined,
    thumbnailUrl: (r.thumbnailUrl as string | null | undefined) ?? null,
    access: accessOf(r, notebook),
    notebookName: nb?.name ?? null,
    publishedViaNotebook: !r.publishedAt && Boolean(nb?.publishedAt),
    owner: owner !== undefined ? owner : (creator?.name ?? null),
    sharedCount: r.sharedCount ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const LIST_PATH: Record<ResourceKind, string> = {
  page: "pages",
  canvas: "canvases",
  project: "projects",
  notebook: "notebooks",
};

export function useResourceList(kind: ResourceKind) {
  const workspaceId = useWorkspaceId();
  const me = useMe().data;
  return useQuery({
    queryKey: ["list", kind, workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      // Items in a published notebook are public too, so the notebook list is needed to label them.
      const [rows, notebooks] = await Promise.all([
        api.get<Row[]>(`/workspaces/${workspaceId}/${LIST_PATH[kind]}`),
        kind === "notebook" ? Promise.resolve([] as Row[]) : api.get<Row[]>(`/workspaces/${workspaceId}/notebooks`),
      ]);
      const info = new Map(notebooks.map((n) => [n.id, { name: String(n.name ?? ""), publishedAt: n.publishedAt }]));
      // Notebook rows carry only createdByUserId; name it when it's you.
      const ownerOf = (r: Row) =>
        kind === "notebook" ? (r.createdByUserId === me?.user.id ? (me?.user.name ?? null) : null) : undefined;
      return rows.map((r) => toItem(kind, r, info, ownerOf(r)));
    },
  });
}

interface SharedRow {
  kind: ResourceKind;
  id: string;
  title: string;
  role: "viewer" | "editor";
  sharedAt: string;
}

export function useSharedWithMe() {
  return useQuery({
    queryKey: ["shared-with-me"],
    queryFn: async () => {
      const rows = await api.get<SharedRow[]>("/me/shared");
      return rows.map<ListItem>((r) => ({
        kind: r.kind,
        id: r.id,
        title: r.title || "Untitled",
        subtitle: `${LABEL[r.kind].one[0]!.toUpperCase()}${LABEL[r.kind].one.slice(1)} · ${r.role === "editor" ? "can edit" : "can view"}`,
        createdAt: r.sharedAt,
        updatedAt: r.sharedAt,
      }));
    },
  });
}

export interface NotebookContents {
  notebook: { id: string; name: string; publishedAt?: string | null; myRole?: "viewer" | "editor" | "owner" };
  items: ListItem[];
}

export function useNotebook(id: string) {
  return useQuery({
    queryKey: ["notebook", id],
    queryFn: async (): Promise<NotebookContents> => {
      const c = await api.get<{
        notebook: NotebookContents["notebook"];
        notes: Row[];
        canvases: Row[];
        projects: Row[];
      }>(`/notebooks/${id}`);
      const published = new Map([[c.notebook.id, { name: c.notebook.name, publishedAt: c.notebook.publishedAt ?? null }]]);
      return {
        notebook: c.notebook,
        items: [
          ...c.notes.map((r) => toItem("page", r, published)),
          ...c.canvases.map((r) => toItem("canvas", r, published)),
          ...c.projects.map((r) => toItem("project", r, published)),
        ],
      };
    },
  });
}

/** Creates an "Untitled" resource (optionally in a notebook); returns its id. */
export async function createResource(
  kind: ResourceKind,
  workspaceId: string,
  notebookId?: string,
): Promise<string> {
  const placement = notebookId ? { notebookId } : {};
  const body =
    kind === "page"
      ? { title: "Untitled", ...placement }
      : kind === "canvas"
        ? { title: "Untitled canvas", ...placement }
        : kind === "project"
          ? { name: "Untitled project", ...placement }
          : { name: "Untitled notebook" };
  const created = await api.post<{ id: string }>(`/workspaces/${workspaceId}/${LIST_PATH[kind]}`, body);
  return created.id;
}

export async function deleteResource(kind: ResourceKind, id: string): Promise<void> {
  const path = kind === "page" ? "pages" : LIST_PATH[kind];
  await api.delete(`/${path}/${id}`);
}

export async function getTitle(kind: Exclude<ResourceKind, "notebook">, id: string): Promise<string> {
  if (kind === "canvas") return (await api.get<{ title: string }>(`/canvases/${id}/summary`)).title;
  if (kind === "page") return (await api.get<{ title: string }>(`/pages/${id}`)).title;
  return (await api.get<{ name: string }>(`/projects/${id}`)).name;
}

/* ───────────── Analytics (published-page views) ───────────── */

export type AnalyticsRange = "24h" | "7d" | "30d" | "6mo" | "1y";

export interface Analytics {
  range: AnalyticsRange;
  unit: "hour" | "day" | "week" | "month";
  buckets: { start: string; views: number; visitors: number }[];
  total: number;
  visitors: number;
  previousTotal: number;
  previousVisitors: number;
  allTime: number;
  allTimeVisitors: number;
  lastViewedAt: string | null;
}

export interface PublishState {
  published: boolean;
  publicUrl: string | null;
  publishedVia: { kind: ResourceKind; id: string; name: string } | null;
}

export function useAnalytics(kind: ResourceKind, id: string, range: AnalyticsRange) {
  return useQuery({
    queryKey: ["analytics", kind, id, range],
    queryFn: () => api.get<Analytics>(`/${kind}/${id}/analytics?range=${range}`),
  });
}

export function usePublishState(kind: ResourceKind, id: string) {
  return useQuery({
    queryKey: ["publish", kind, id],
    queryFn: () => api.get<PublishState>(`/${kind}/${id}/publish`),
  });
}
