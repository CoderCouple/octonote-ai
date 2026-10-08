/**
 * The four resource kinds as the mobile lists see them, and the API calls
 * behind create / list / delete. Mirrors the web app's library feature.
 */
import type { ResourceKind } from "@octonote/shared";
import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { api } from "@/lib/api";

export type { ResourceKind };

export interface ListItem {
  kind: ResourceKind;
  id: string;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string | null;
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

type Row = Record<string, unknown> & { id: string; updatedAt: string };

function snippet(md: unknown): string | undefined {
  return typeof md === "string" ? md.trim().replace(/\s+/g, " ").slice(0, 120) || undefined : undefined;
}

function toItem(kind: ResourceKind, r: Row): ListItem {
  return {
    kind,
    id: r.id,
    title: String(r.title ?? r.name ?? "") || "Untitled",
    subtitle: kind === "page" ? snippet(r.contentMd) : kind === "project" ? ((r.description as string) ?? "Note + canvas") : undefined,
    thumbnailUrl: (r.thumbnailUrl as string | null | undefined) ?? null,
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
  return useQuery({
    queryKey: ["list", kind, workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const rows = await api.get<Row[]>(`/workspaces/${workspaceId}/${LIST_PATH[kind]}`);
      return rows.map((r) => toItem(kind, r));
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
        updatedAt: r.sharedAt,
      }));
    },
  });
}

export interface NotebookContents {
  notebook: { id: string; name: string; myRole?: "viewer" | "editor" | "owner" };
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
      return {
        notebook: c.notebook,
        items: [
          ...c.notes.map((r) => toItem("page", r)),
          ...c.canvases.map((r) => toItem("canvas", r)),
          ...c.projects.map((r) => toItem("project", r)),
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
