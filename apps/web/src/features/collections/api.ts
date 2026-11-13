import { clientApi } from "@/lib/api/client-fetch";

export type ClipApp =
  "chatgpt" | "claude" | "gemini" | "octonote" | "web" | "other";

export interface ClipSource {
  app: ClipApp;
  url?: string;
  title?: string;
}

export interface Clip {
  id: string;
  content: string;
  source: ClipSource;
  position: number;
  createdAt: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  updatedAt: string;
  clips: number;
}

export interface Collection {
  id: string;
  name: string;
  workspaceId: string;
  clips: Clip[];
}

export const MODES = [
  { id: "summary", label: "Summary" },
  { id: "report", label: "Report" },
  { id: "comparison", label: "Comparison table" },
  { id: "study_notes", label: "Study notes" },
  { id: "outline", label: "Outline" },
  { id: "faq", label: "FAQ" },
  { id: "article", label: "Article" },
  { id: "brief", label: "Brief" },
  { id: "flashcards", label: "Flashcards" },
  { id: "custom", label: "Something else…" },
] as const;

export type Mode = (typeof MODES)[number]["id"];

export interface DraftUnit {
  id: number;
  text: string;
  start: number;
  end: number;
  cites: number[];
  status: "ok" | "flagged";
  verdict?: "supported" | "inference" | "partial" | "unsupported";
  reasons: string[];
}

export interface Draft {
  title: string;
  mode: Mode;
  body: string;
  sources: string;
  units: DraftUnit[];
  checked: boolean;
}

export const APP_LABELS: Record<ClipApp, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  octonote: "Octonote",
  web: "Web",
  other: "Other",
};

export const listCollections = (workspaceId: string) =>
  clientApi.get<CollectionSummary[]>(
    `/collections?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
export const createCollection = (workspaceId: string, name: string) =>
  clientApi.post<{ id: string; name: string }>("/collections", {
    workspaceId,
    name,
  });
export const getCollection = (id: string) =>
  clientApi.get<Collection>(`/collections/${id}`);
export const renameCollection = (id: string, name: string) =>
  clientApi.patch<{ id: string; name: string }>(`/collections/${id}`, { name });
export const deleteCollection = (id: string) =>
  clientApi.delete<void>(`/collections/${id}`);
export const addClip = (id: string, content: string, source: ClipSource) =>
  clientApi.post<Clip>(`/collections/${id}/clips`, { content, source });
export const editClip = (clipId: string, content: string) =>
  clientApi.patch<Clip>(`/collections/clips/${clipId}`, { content });
export const deleteClip = (clipId: string) =>
  clientApi.delete<void>(`/collections/clips/${clipId}`);
export const reorderClips = (id: string, ids: string[]) =>
  clientApi.post<Collection>(`/collections/${id}/order`, { ids });
export const composeDraft = (id: string, mode: Mode, instructions?: string) =>
  clientApi.post<Draft>(`/collections/${id}/compose`, {
    mode,
    ...(instructions?.trim() ? { instructions } : {}),
  });
export const saveDraft = (
  id: string,
  draft: { title: string; body: string; sources: string; mode: Mode },
) =>
  clientApi.post<{ id: string; title: string }>(
    `/collections/${id}/save`,
    draft,
  );
