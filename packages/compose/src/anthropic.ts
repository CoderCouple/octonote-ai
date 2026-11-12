import type { ModelClient } from "./agent.js";

/**
 * The part of the Anthropic SDK this adapter uses, so compose doesn't depend
 * on the SDK: pass `new Anthropic({ apiKey })`.
 */
export interface AnthropicLike {
  messages: {
    // Loose on purpose: any SDK version whose create() takes these params fits.
    create(params: any, options?: any): Promise<unknown>;
  };
}

type StreamEvent = { type: string; content_block?: { type: string; name?: string }; delta?: { type: string; partial_json?: string; stop_reason?: string } };

/** True for the API's "this model can't force a tool" error, so we can fall back. */
const forcingUnsupported = (error: unknown) => /tool_choice/i.test(String((error as Error)?.message ?? error)) && /not supported/i.test(String((error as Error)?.message ?? error));

/**
 * A ModelClient over Claude. Tool calls are streamed, so partial JSON reaches
 * `onPartial` as the model writes it. The tool is forced where the model
 * supports that; otherwise it's the only tool offered and the model is told
 * to call it, which comes to the same thing.
 */
export function anthropicModel(client: AnthropicLike, model = "claude-opus-5-5"): ModelClient {
  let canForce = true;

  return {
    async callTool({ system, messages, tool, maxTokens = 8000, onPartial, signal }) {
      const run = async (force: boolean) => {
        const stream = (await client.messages.create(
          {
            model,
            max_tokens: maxTokens,
            system: force ? system : `${system}\n\nRespond only by calling the ${tool.name} tool, exactly once. Do not write anything outside the tool call.`,
            messages,
            tools: [{ name: tool.name, description: tool.description, input_schema: tool.inputSchema }],
            tool_choice: force ? { type: "tool", name: tool.name } : { type: "auto" },
            stream: true,
          },
          { signal },
        )) as AsyncIterable<StreamEvent>;
        let json = "";
        let inTool = false;
        let stopReason: string | undefined;
        for await (const event of stream) {
          if (event.type === "content_block_start") inTool = event.content_block?.type === "tool_use" && event.content_block.name === tool.name;
          else if (event.type === "content_block_delta" && inTool && event.delta?.type === "input_json_delta") {
            json += event.delta.partial_json ?? "";
            onPartial?.(json);
          } else if (event.type === "message_delta" && event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        }
        if (!json) throw new Error(stopReason === "max_tokens" ? "The response was too long and got cut off" : `The model didn't call ${tool.name}`);
        try {
          return JSON.parse(json);
        } catch {
          throw new Error(stopReason === "max_tokens" ? "The response was too long and got cut off" : "The model's tool input wasn't valid JSON");
        }
      };

      if (canForce) {
        try {
          return await run(true);
        } catch (error) {
          if (!forcingUnsupported(error)) throw error;
          canForce = false;
        }
      }
      return run(false);
    },
  };
}
