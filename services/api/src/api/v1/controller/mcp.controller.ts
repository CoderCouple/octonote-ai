import { All, Controller, Logger, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ActivityService } from "../../../common/activity.service";
import { apiBase } from "../../../common/api-base";
import { SkipResponseInterceptor } from "../../../common/interceptor/skip-response-interceptor.decorator";
import { McpToolsService, type Actor } from "../../../service/mcp-tools.service";
import { PREVIEW_MIME, PREVIEW_URI, previewHtml } from "../../../mcp/preview-view";
import { mcpResource, OAuthService } from "../../../service/oauth.service";
import { VERSION_INFO } from "./mcp-version";

const INSTRUCTIONS = `Octonote holds the user's notes (markdown documents), canvases (diagrams), projects (one note + one canvas side by side) and notebooks (folders).
- Write notes in markdown: headings, lists, checklists, tables, code, quotes, images by URL, $inline math$, $$display math$$ and \`\`\`mermaid blocks.
- Draw canvases from a mermaid flowchart or class diagram; they become real, editable shapes. Add \`click Node href "https://…"\` lines to make boxes link somewhere (e.g. code on GitHub).
- Ids carry their kind: pag_ note, cnv_ canvas, prj_ project, ntb_ notebook. Notebooks can be named by exact name.
- Always give the user the link (url, and publicUrl once published).
- Publish, share, change link access or delete ONLY when the user explicitly asked for it.`;

// Every tool states all three hints (directory reviews check them):
// read-only; creates/edits (additive); overwrites or deletes; reaches beyond
// the workspace (public web, other people).
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const OVERWRITE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;
const OUTWARD = { readOnlyHint: false, destructiveHint: false, openWorldHint: true } as const;

/** The card may load images from Supabase Storage (canvas snapshots) and scripts from jsdelivr (mermaid, KaTeX). */
function previewUiMeta() {
  const domains = ["https://cdn.jsdelivr.net"];
  try {
    if (process.env.SUPABASE_URL) domains.push(new URL(process.env.SUPABASE_URL).origin);
  } catch {
    /* no storage origin: snapshots just won't load */
  }
  return { ui: { csp: { resourceDomains: domains, connectDomains: [] }, prefersBorder: true } };
}

/** Tools whose result renders as the inline card in MCP Apps hosts. */
const CARD = { ui: { resourceUri: PREVIEW_URI }, "openai/outputTemplate": PREVIEW_URI } as const;

const id = z.string().describe("Octonote id: pag_… note, cnv_… canvas, prj_… project, ntb_… notebook");
const notebook = z.string().optional().describe("Put it in this notebook (id or exact name)");

/**
 * The MCP server for assistant apps (Claude.ai, ChatGPT, Gemini CLI):
 * Streamable HTTP, stateless (a fresh server per request), JSON responses.
 * Callers present an OAuth access token issued for this exact resource;
 * without one they get 401 + where to sign in (RFC 9728).
 */
@Controller("mcp")
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly tools: McpToolsService,
    private readonly activity: ActivityService,
  ) {}

  @All()
  @SkipResponseInterceptor()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const base = apiBase(req.headers);
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const found = token ? await this.oauth.verifyAccessToken(token, mcpResource(base)) : null;
    if (!found) {
      const challenge = [
        `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
        ...(token ? [`error="invalid_token"`, `error_description="The access token is invalid or expired."`] : []),
      ].join(", ");
      return reply
        .status(401)
        .header("www-authenticate", challenge)
        .send({ error: token ? "invalid_token" : "unauthorized", error_description: "Sign in to Octonote to use this server." });
    }
    if (req.method !== "POST") {
      // Stateless server: no standalone SSE stream (GET) and no sessions to end (DELETE).
      return reply.status(405).header("allow", "POST").send({ error: "method_not_allowed" });
    }

    void this.activity.record(found.user.id, "mcp");
    const actor: Actor = { id: found.user.id, email: found.user.email, name: found.user.name };
    const server = this.server(actor);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      this.logger.error(err);
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
      }
    }
  }

  /** One server per request, with every tool bound to the signed-in person. */
  private server(actor: Actor) {
    const server = new McpServer(VERSION_INFO, { instructions: INSTRUCTIONS });
    // The SDK's registerTool generics send tsc out of memory with zod 3 shapes;
    // this keeps argument types without them.
    const tool = <S extends z.ZodRawShape>(
      name: string,
      config: {
        title: string;
        description: string;
        inputSchema: S;
        annotations: Record<string, boolean>;
        _meta?: Record<string, unknown>;
      },
      handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    ) =>
      (server.registerTool.bind(server) as unknown as (n: string, c: unknown, h: unknown) => void)(
        name,
        { ...config, annotations: { title: config.title, ...config.annotations } },
        handler,
      );
    const t = this.tools;
    server.registerResource(
      "octonote-preview",
      PREVIEW_URI,
      { title: "Octonote card", description: "Shows a note, canvas, project or notebook inline.", mimeType: PREVIEW_MIME, _meta: previewUiMeta() },
      async () => ({ contents: [{ uri: PREVIEW_URI, mimeType: PREVIEW_MIME, text: previewHtml(), _meta: previewUiMeta() }] }),
    );
    /** Like run(), plus the item's card data in structuredContent (kept out of the model's context). */
    const runCard = <R>(fn: () => Promise<R>, itemId: (r: R) => string) => async () => {
      try {
        const result = await fn();
        const preview = await t.preview(actor.id, itemId(result)).catch(() => null);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          ...(preview ? { structuredContent: { preview } } : {}),
        };
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
    };
    const run = (fn: () => Promise<unknown>) => async () => {
      try {
        const result = await fn();
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: errorText(err) }] };
      }
    };

    // ChatGPT's connectors look for exactly these two read tools.
    tool(
      "search",
      {
        title: "Search Octonote",
        description: "Find the user's notes, canvases, projects and notebooks by title. Returns each match's id, title and link.",
        inputSchema: { query: z.string().describe("Words from the title") },
        annotations: READ,
      },
      async ({ query }) =>
        run(async () => ({
          results: (await t.search(actor.id, query)).map((i) => ({ id: i.id, title: `${i.title} (${i.kind})`, url: i.url })),
        }))(),
    );
    tool(
      "fetch",
      {
        title: "Open an item",
        description: "Read one item: a note's markdown, a project's note, a notebook's contents, or a canvas summary.",
        inputSchema: { id },
        annotations: READ,
        _meta: CARD,
      },
      async ({ id }) =>
        runCard(
          async () => {
            const item = await t.fetch(actor.id, id);
            return { id: item.id, title: item.title, text: item.text, url: item.url, metadata: { kind: item.kind } };
          },
          (r) => r.id,
        )(),
    );
    tool(
      "list_items",
      {
        title: "List items",
        description: "List the user's items, newest first; optionally one kind, or the contents of one notebook.",
        inputSchema: {
          kind: z.enum(["note", "canvas", "project", "notebook"]).optional(),
          notebook: z.string().optional().describe("Only items in this notebook (id or exact name)"),
        },
        annotations: READ,
      },
      async (args) => run(() => t.list(actor.id, args))(),
    );

    tool(
      "create_note",
      {
        title: "Create a note",
        description: "Create a note from markdown (math, mermaid, code and tables work). Returns its link.",
        inputSchema: { title: z.string(), markdown: z.string().optional(), notebook },
        annotations: WRITE,
        _meta: CARD,
      },
      async (args) => runCard(() => t.createNote(actor.id, args), (r) => r.id)(),
    );
    tool(
      "update_note",
      {
        title: "Update a note",
        description: "Replace a note's content with markdown, or append markdown to the end.",
        inputSchema: {
          id,
          markdown: z.string(),
          mode: z.enum(["replace", "append"]).default("replace"),
          title: z.string().optional().describe("New title (replace mode only)"),
        },
        annotations: OVERWRITE,
        _meta: CARD,
      },
      async (args) => runCard(() => t.updateNote(actor.id, args), (r) => r.id)(),
    );
    tool(
      "create_canvas",
      {
        title: "Draw a canvas",
        description:
          "Create a canvas drawn from a mermaid flowchart (graph/flowchart) or class diagram (classDiagram) as real, editable shapes. Other mermaid diagram types are not supported on canvases; notes can contain them as ```mermaid blocks.",
        inputSchema: { title: z.string(), mermaid: z.string().optional(), notebook },
        annotations: WRITE,
        _meta: CARD,
      },
      async (args) => runCard(() => t.createCanvas(actor.id, args), (r) => r.id)(),
    );
    tool(
      "redraw_canvas",
      {
        title: "Redraw a canvas",
        description: "Replace a canvas's drawing with a mermaid flowchart or class diagram.",
        inputSchema: { id, mermaid: z.string(), title: z.string().optional() },
        annotations: OVERWRITE,
        _meta: CARD,
      },
      async (args) => runCard(() => t.redrawCanvas(actor.id, args), (r) => r.id)(),
    );
    tool(
      "create_project",
      {
        title: "Create a project",
        description: "Create a project — a note and a canvas side by side — filled in one go.",
        inputSchema: {
          title: z.string(),
          note_markdown: z.string().optional(),
          canvas_mermaid: z.string().optional().describe("Mermaid flowchart or class diagram"),
          view: z.enum(["notes", "canvas", "split"]).default("split").describe("What readers see first"),
          notebook,
        },
        annotations: WRITE,
        _meta: CARD,
      },
      async (a) =>
        runCard(
          () =>
            t.createProject(actor.id, {
              title: a.title,
              noteMarkdown: a.note_markdown,
              canvasMermaid: a.canvas_mermaid,
              view: a.view,
              notebook: a.notebook,
            }),
          (r) => r.id,
        )(),
    );
    tool(
      "create_notebook",
      { title: "Create a notebook", description: "Create a notebook (a folder).", inputSchema: { name: z.string() }, annotations: WRITE },
      async (args) => run(() => t.createNotebook(actor.id, args))(),
    );
    tool(
      "rename",
      { title: "Rename", description: "Rename a note, canvas, project or notebook.", inputSchema: { id, name: z.string() }, annotations: WRITE },
      async (args) => run(() => t.rename(actor.id, args))(),
    );
    tool(
      "move",
      {
        title: "Move",
        description: "Move a note, canvas or project into a notebook, or out of it (notebook: null).",
        inputSchema: { id, notebook: z.string().nullable().describe("Notebook id or exact name; null takes it out") },
        annotations: WRITE,
      },
      async (args) => run(() => t.move(actor.id, args))(),
    );

    tool(
      "publish",
      {
        title: "Publish to the web",
        description:
          "Make an item a public, read-only web page and return its publicUrl, or unpublish it. Publishing a notebook publishes everything in it.",
        inputSchema: { id, published: z.boolean().default(true).describe("false unpublishes") },
        annotations: OUTWARD,
        _meta: CARD,
      },
      async (args) => runCard(() => t.setPublished(actor.id, args), (r) => r.id)(),
    );
    tool(
      "share",
      {
        title: "Share with a person",
        description: "Give a person viewer or editor access by email; they receive an invitation email.",
        inputSchema: { id, email: z.string().email(), role: z.enum(["viewer", "editor"]).default("viewer") },
        annotations: OUTWARD,
      },
      async (args) => run(() => t.share(actor, args))(),
    );
    tool(
      "set_link_access",
      {
        title: "Set link access",
        description: "Set whether anyone with the link can view or edit an item, or turn link access off.",
        inputSchema: { id, access: z.enum(["off", "view", "edit"]) },
        annotations: OUTWARD,
      },
      async (args) => run(() => t.setLinkAccess(actor.id, args))(),
    );
    tool(
      "delete",
      {
        title: "Delete",
        description: "Delete a note, canvas, project or notebook. Deleting a notebook moves its items to the top level.",
        inputSchema: { id },
        annotations: OVERWRITE,
      },
      async (args) => run(() => t.remove(actor.id, args))(),
    );
    return server;
  }
}

/** A service error's message (plan limits, permissions, bad mermaid) is what the assistant should relay. */
function errorText(err: unknown): string {
  const e = err as { getResponse?: () => unknown; message?: string };
  const body = e.getResponse?.() as { code?: string; message?: string; extra?: { line?: number } } | undefined;
  if (body && typeof body === "object" && body.message) {
    return JSON.stringify({ error: body.code ?? "ERROR", message: body.message, ...(body.extra?.line ? { line: body.extra.line } : {}) });
  }
  return JSON.stringify({ error: "ERROR", message: e.message ?? "Something went wrong." });
}
