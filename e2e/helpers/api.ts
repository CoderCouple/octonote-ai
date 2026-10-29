/**
 * A tiny client for the local API (`{ result }` envelope) that remembers what
 * a test created so the fixture can delete it afterwards.
 */
import { API_URL } from "./env";

export type Kind = "page" | "canvas" | "project" | "notebook";
const PATH: Record<Kind, string> = { page: "pages", canvas: "canvases", project: "projects", notebook: "notebooks" };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

/* Loose shapes: tests assert on what they need. */
export interface CanvasDoc {
  version: number;
  items: Array<Record<string, any> & { id: string; type: string }>;
  [key: string]: unknown;
}
export interface Canvas {
  id: string;
  title: string;
  document: CanvasDoc;
  documentFormat?: string;
  thumbnailUrl: string | null;
  notebookId: string | null;
  projectId: string | null;
  publicSlug: string | null;
  linkAccess: string;
  [key: string]: unknown;
}

export class Api {
  private created: { kind: Kind; id: string }[] = [];

  constructor(
    private token: string | null,
    readonly workspaceId: string,
  ) {}

  /** The same client without credentials (a signed-out visitor). */
  anonymous(): Api {
    return new Api(null, this.workspaceId);
  }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(API_URL + path, {
      method,
      headers: {
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as any) : {};
    if (!res.ok) throw new ApiError(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`, res.status, json);
    return (json?.result ?? json) as T;
  }

  /** Registers something created outside `create*` (e.g. through the UI) for cleanup. */
  track(kind: Kind, id: string): void {
    if (!this.created.some((c) => c.kind === kind && c.id === id)) this.created.push({ kind, id });
  }

  async createCanvas(title: string, opts: { mermaid?: string; notebookId?: string } = {}): Promise<Canvas> {
    const c = await this.request<Canvas>("POST", `/workspaces/${this.workspaceId}/canvases`, { title, ...opts });
    this.track("canvas", c.id);
    return c;
  }
  getCanvas(id: string): Promise<Canvas> {
    return this.request<Canvas>("GET", `/canvases/${id}`);
  }
  updateCanvas(id: string, patch: { title?: string; document?: unknown }): Promise<Canvas> {
    return this.request<Canvas>("PATCH", `/canvases/${id}`, patch);
  }
  listCanvasFigures(canvasId: string): Promise<Array<{ id: string; title: string; imageUrl?: string; contentHash?: string; [k: string]: unknown }>> {
    return this.request("GET", `/canvases/${canvasId}/figures`);
  }

  async createNote(title: string, opts: { markdown?: string; notebookId?: string } = {}): Promise<any> {
    const n = await this.request("POST", `/workspaces/${this.workspaceId}/pages`, { title, ...opts });
    this.track("page", n.id);
    return n;
  }
  getNote(id: string): Promise<any> {
    return this.request("GET", `/pages/${id}`);
  }
  updateNote(id: string, patch: { title?: string; document?: unknown }): Promise<any> {
    return this.request("PATCH", `/pages/${id}`, patch);
  }

  async createProject(name: string, opts: { notebookId?: string } = {}): Promise<any> {
    const p = await this.request("POST", `/workspaces/${this.workspaceId}/projects`, { name, ...opts });
    this.track("project", p.id);
    return p;
  }
  /** Project with its pair: `noteId`, `canvasId`. */
  getProject(id: string): Promise<any> {
    return this.request("GET", `/projects/${id}`);
  }

  async createNotebook(name: string): Promise<any> {
    const nb = await this.request("POST", `/workspaces/${this.workspaceId}/notebooks`, { name });
    this.track("notebook", nb.id);
    return nb;
  }
  getNotebook(id: string): Promise<any> {
    return this.request("GET", `/notebooks/${id}`);
  }

  move(kind: Exclude<Kind, "notebook">, id: string, notebookId: string | null): Promise<any> {
    return this.request("POST", `/${PATH[kind]}/${id}/move`, { notebookId });
  }
  publish(kind: Kind, id: string, published = true): Promise<{ published: boolean; publicSlug: string | null; publicUrl: string | null }> {
    return this.request("PUT", `/${kind}/${id}/publish`, { published });
  }
  generalAccess(kind: Kind, id: string, linkAccess: "restricted" | "anyone_with_link", linkRole: "viewer" | "editor" = "viewer"): Promise<void> {
    return this.request("PUT", `/${kind}/${id}/general-access`, { linkAccess, linkRole });
  }

  async delete(kind: Kind, id: string): Promise<void> {
    await this.request("DELETE", `/${PATH[kind]}/${id}`);
  }

  /** Deletes everything this test created: items first, notebooks last. */
  async cleanup(): Promise<string[]> {
    const order: Kind[] = ["page", "canvas", "project", "notebook"];
    const problems: string[] = [];
    const items = [...this.created].reverse().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    for (const { kind, id } of items) {
      try {
        await this.delete(kind, id);
      } catch (err) {
        // Already gone (deleted by the test, or with its project) is fine.
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 403))) problems.push(String(err));
      }
    }
    this.created = [];
    return problems;
  }
}
