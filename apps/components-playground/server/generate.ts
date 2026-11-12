import Anthropic from "@anthropic-ai/sdk";
import type { Plugin } from "vite";
import { defaultRegistry, normalizeSpec, sessionToolDefinition, type SpecIssue } from "@octonote/interactive";

const MODEL = "claude-opus-5-5";

/**
 * POST /api/generate { prompt } → { spec } | { error, issues? }
 * Asks Claude for a session through a forced tool call, validates the result,
 * and gives the model one chance to fix any problems.
 */
export function generateRoute(apiKey: string | undefined): Plugin {
  return {
    name: "study-session-generate",
    configureServer(server) {
      server.middlewares.use("/api/generate", async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return send(405, { error: "Use POST" });
        if (!apiKey) return send(503, { error: "Set ANTHROPIC_API_KEY in apps/components-playground/.env.local and restart the dev server." });
        let prompt = "";
        try {
          let body = "";
          for await (const chunk of req) body += chunk;
          prompt = String(JSON.parse(body).prompt ?? "").trim().slice(0, 2000);
        } catch {
          return send(400, { error: "Send JSON: { prompt }" });
        }
        if (!prompt) return send(400, { error: "Write what the session should teach." });
        try {
          send(200, await generate(new Anthropic({ apiKey }), prompt));
        } catch (error) {
          send(502, { error: (error as Error).message });
        }
      });
    },
  };
}

async function generate(client: Anthropic, prompt: string): Promise<{ spec: unknown } | { error: string; issues: SpecIssue[] }> {
  const tool = sessionToolDefinition(defaultRegistry);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `${prompt}\n\nBuild a study session with flashcards, practice questions, a mind map, a matching exercise and a short scored quiz with explanations. Keep facts accurate and the language clear for the learner.`,
    },
  ];
  let issues: SpecIssue[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await client.messages.create({
      model: MODEL,
      max_tokens: 16_000,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: tool.name },
      messages,
    });
    const call = reply.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!call) return { error: "The model didn't return a session.", issues: [] };
    const result = defaultRegistry.validate(normalizeSpec(call.input));
    if (result.ok) return { spec: result.spec };
    issues = result.issues;
    messages.push(
      { role: "assistant", content: reply.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: `The session is invalid. Fix these problems and call the tool again:\n${issues.map((i) => `- ${i.path || "(root)"}: ${i.message}`).join("\n")}`,
          },
        ],
      },
    );
  }
  return { error: "The generated session still had problems after one retry.", issues };
}
