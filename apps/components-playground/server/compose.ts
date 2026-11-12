import { Readable } from "node:stream";
import Anthropic from "@anthropic-ai/sdk";
import type { Plugin } from "vite";
import { anthropicModel, defaultCatalog, respond, restoreResponse, toEventStream, type ComposedResponse, type ModelMessage } from "@octonote/compose";

/**
 * POST /api/compose { question, history? } → server-sent compose events.
 * The API key stays in this dev server.
 */
export function composeRoute(apiKey: string | undefined): Plugin {
  return {
    name: "compose-route",
    configureServer(server) {
      server.middlewares.use("/api/compose", async (req, res) => {
        const fail = (status: number, error: string) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error }));
        };
        if (req.method !== "POST") return fail(405, "Use POST");
        if (!apiKey) return fail(503, "No ANTHROPIC_API_KEY: add it to apps/components-playground/.env.local and restart, or use the demo answers.");
        let question = "";
        let history: ModelMessage[] = [];
        let previous: ComposedResponse | undefined;
        let learnerContext: string | undefined;
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          const parsed = JSON.parse(body);
          question = String(parsed.question ?? "").trim().slice(0, 2000);
          history = Array.isArray(parsed.history) ? parsed.history.slice(-6) : [];
          // The client's copy of the previous answer is re-validated before the model sees it.
          previous = restoreResponse(defaultCatalog, parsed.previous);
          learnerContext = typeof parsed.learnerContext === "string" ? parsed.learnerContext.slice(0, 1000) : undefined;
        } catch {
          return fail(400, "Send JSON: { question }");
        }
        if (!question) return fail(400, "Ask a question");

        const abort = new AbortController();
        req.on("close", () => abort.abort());
        res.setHeader("content-type", "text/event-stream");
        res.setHeader("cache-control", "no-cache");
        const model = anthropicModel(new Anthropic({ apiKey }), process.env.COMPOSE_MODEL ?? "claude-opus-5-5");
        Readable.fromWeb(toEventStream(respond({ question, history, previous, learnerContext, model, signal: abort.signal, allowCustom: true })) as never).pipe(res);
      });
    },
  };
}
