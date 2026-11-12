import { LIMITS } from "./limits.js";
import { normalizeSpec } from "./normalize.js";
import { SCHEMA_VERSION } from "./schemas/common.js";
import { defaultRegistry, type ActivityRegistry, type ActivitySpec, type ValidationResult } from "./registry.js";

/**
 * A provider-neutral tool definition. Pass `inputSchema` as `input_schema` to
 * Anthropic, or as `parameters` to OpenAI and Gemini function calling.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function sessionToolDefinition(registry: ActivityRegistry = defaultRegistry, name = "create_study_session"): ToolDefinition {
  const kinds = registry
    .capabilities()
    .map((c) => `- ${c.type}: ${c.description}`)
    .join("\n");
  return {
    name,
    description: [
      "Create a study session: a titled list of interactive activities rendered as components.",
      `Set schemaVersion to "${SCHEMA_VERSION}" everywhere and give every activity, card, question, option, pair and node a short id unique in its list.`,
      "Write plain text only: no HTML, no markdown, no code.",
      "Questions can be answered in eight ways (see `kind`): choose the one that tests the idea best, e.g. fill_blank for a key term, numeric for a calculation, order for a sequence of steps or events, categorize for sorting examples into groups, short_answer for explaining why. Avoid answers given away by the question, a right option much longer than the rest, and \"all of the above\".",
      "Activity types:",
      kinds,
    ].join("\n"),
    inputSchema: registry.sessionJsonSchema(),
  };
}

export interface ParseOptions {
  /** Fix common model mistakes with `normalizeSpec` before validating. */
  normalize?: boolean;
}

/**
 * Reads JSON text, refusing anything over the size limit. Never throws.
 */
export function parseSpec(json: string, registry: ActivityRegistry = defaultRegistry, options: ParseOptions = {}): ValidationResult<ActivitySpec> {
  if (json.length > LIMITS.jsonLength) {
    return { ok: false, issues: [{ path: "", message: `Spec is longer than ${LIMITS.jsonLength} characters` }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return { ok: false, issues: [{ path: "", message: `Not valid JSON: ${(error as Error).message}` }] };
  }
  return registry.validate(options.normalize ? normalizeSpec(value) : value);
}

/**
 * Finds the JSON in a model's text reply (bare, or in a ```json fence) and
 * validates it, fixing common mistakes first unless `normalize` is false. For
 * tool calls, validate `normalizeSpec(input)` with `registry.validate`.
 */
export function parseModelOutput(text: string, registry: ActivityRegistry = defaultRegistry, options: ParseOptions = { normalize: true }): ValidationResult<ActivitySpec> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) return { ok: false, issues: [{ path: "", message: "No JSON object in the reply" }] };
  return parseSpec(body.slice(start, end + 1), registry, options);
}
