import { z } from "zod/v4";
import { LIMITS } from "./limits.js";
import { idSchema, schemaVersionSchema, textSchema, titleSchema } from "./schemas/common.js";
import { flashcardsSchema } from "./schemas/flashcards.js";
import { matchingSchema } from "./schemas/matching.js";
import { mindmapSchema } from "./schemas/mindmap.js";
import { mcqSchema, quizSchema } from "./schemas/questions.js";

/** Fields every activity spec carries, whatever its type. */
export interface ActivitySpecBase {
  schemaVersion: string;
  type: string;
  id: string;
  title?: string;
  description?: string;
}

/** Several activities studied in order. */
export interface SessionSpec {
  schemaVersion: string;
  type: "session";
  id: string;
  title: string;
  description?: string;
  activities: ActivitySpecBase[];
}

export type ActivitySpec = ActivitySpecBase | SessionSpec;

export interface ActivityDefinition<S extends ActivitySpecBase = ActivitySpecBase> {
  /** The spec's `type` value. */
  type: string;
  /** Version of this activity's schema, for capability discovery. */
  version: string;
  /** What the activity is for. Language models read this when choosing activities. */
  description: string;
  schema: z.ZodType<S>;
}

export interface SpecIssue {
  /** Dotted path to the bad value, e.g. `activities.2.questions.0.correct`. Empty for the whole spec. */
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; spec: T } | { ok: false; issues: SpecIssue[] };

export interface ActivityCapability {
  type: string;
  version: string;
  description: string;
  jsonSchema: Record<string, unknown>;
}

export interface ActivityRegistry {
  get(type: string): ActivityDefinition | undefined;
  types(): string[];
  /** A new registry with these definitions added. Throws if a type is already registered. */
  extend(...definitions: ActivityDefinition<any>[]): ActivityRegistry;
  /** Checks an activity or a session. Never throws. */
  validate(input: unknown): ValidationResult<ActivitySpec>;
  validateActivity(input: unknown): ValidationResult<ActivitySpecBase>;
  /** What this registry can render, with a JSON Schema per activity. */
  capabilities(): ActivityCapability[];
  /** JSON Schema for a session made of any registered activities. */
  sessionJsonSchema(): Record<string, unknown>;
}

export const builtInActivities: ActivityDefinition<any>[] = [
  {
    type: "flashcards",
    version: "1.0",
    description: "A deck of two-sided cards for memorising terms, definitions and facts.",
    schema: flashcardsSchema,
  },
  {
    type: "mcq",
    version: "1.0",
    description: "Practice multiple-choice questions, each checked straight away with hints and explanations.",
    schema: mcqSchema,
  },
  {
    type: "quiz",
    version: "1.0",
    description: "A scored assessment: the learner answers every question, submits, then reviews results. Can be timed.",
    schema: quizSchema,
  },
  {
    type: "mindmap",
    version: "1.0",
    description: "A tree of topics around one central idea, for seeing how concepts relate.",
    schema: mindmapSchema,
  },
  {
    type: "matching",
    version: "1.0",
    description: "Match each item in one column to its partner in the other, e.g. terms to definitions.",
    schema: matchingSchema,
  },
];

const sessionEnvelope = z.object({
  schemaVersion: schemaVersionSchema,
  type: z.literal("session"),
  id: idSchema,
  title: titleSchema,
  description: textSchema.optional(),
  activities: z.array(z.unknown()).min(1).max(LIMITS.sessionActivities),
});

function joinPath(prefix: string, path: readonly PropertyKey[]): string {
  return [prefix, ...path.map(String)].filter(Boolean).join(".");
}

function toIssues(error: z.ZodError, prefix = ""): SpecIssue[] {
  return error.issues.map((issue) => ({ path: joinPath(prefix, issue.path), message: issue.message }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createRegistry(definitions: readonly ActivityDefinition<any>[] = builtInActivities): ActivityRegistry {
  const byType = new Map<string, ActivityDefinition>();
  for (const def of definitions) {
    if (def.type === "session") throw new Error('"session" is reserved for sessions');
    if (byType.has(def.type)) throw new Error(`Activity type "${def.type}" is already registered`);
    byType.set(def.type, def);
  }

  function validateActivityAt(input: unknown, prefix: string): ValidationResult<ActivitySpecBase> {
    if (!isRecord(input)) return { ok: false, issues: [{ path: prefix, message: "Expected an object" }] };
    const type = input.type;
    if (typeof type !== "string") return { ok: false, issues: [{ path: joinPath(prefix, ["type"]), message: "Missing activity type" }] };
    const def = byType.get(type);
    if (!def) {
      const known = [...byType.keys()].join(", ");
      return { ok: false, issues: [{ path: joinPath(prefix, ["type"]), message: `Unknown activity type "${type}". Known types: ${known}` }] };
    }
    const parsed = def.schema.safeParse(input);
    return parsed.success ? { ok: true, spec: parsed.data } : { ok: false, issues: toIssues(parsed.error, prefix) };
  }

  const registry: ActivityRegistry = {
    get: (type) => byType.get(type),
    types: () => [...byType.keys()],
    extend: (...more) => createRegistry([...byType.values(), ...more]),
    validateActivity: (input) => validateActivityAt(input, ""),
    validate(input) {
      if (!isRecord(input) || input.type !== "session") return validateActivityAt(input, "");
      const envelope = sessionEnvelope.safeParse(input);
      if (!envelope.success) return { ok: false, issues: toIssues(envelope.error) };
      const issues: SpecIssue[] = [];
      const activities: ActivitySpecBase[] = [];
      const ids = new Set<string>();
      envelope.data.activities.forEach((raw, i) => {
        const prefix = `activities.${i}`;
        if (isRecord(raw) && raw.type === "session") {
          issues.push({ path: `${prefix}.type`, message: "Sessions cannot contain sessions" });
          return;
        }
        const result = validateActivityAt(raw, prefix);
        if (!result.ok) {
          issues.push(...result.issues);
          return;
        }
        if (ids.has(result.spec.id)) issues.push({ path: `${prefix}.id`, message: `Duplicate activity id "${result.spec.id}"` });
        ids.add(result.spec.id);
        activities.push(result.spec);
      });
      if (issues.length) return { ok: false, issues };
      return { ok: true, spec: { ...envelope.data, activities } };
    },
    capabilities: () =>
      [...byType.values()].map((def) => ({
        type: def.type,
        version: def.version,
        description: def.description,
        jsonSchema: z.toJSONSchema(def.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>,
      })),
    sessionJsonSchema() {
      const schemas = [...byType.values()].map((def) => def.schema);
      const activity = schemas.length === 1 ? schemas[0]! : z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
      const session = sessionEnvelope.extend({
        activities: z.array(activity).min(1).max(LIMITS.sessionActivities),
      });
      return z.toJSONSchema(session, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    },
  };
  return registry;
}

/** A registry with the built-in activities. */
export const defaultRegistry = createRegistry();

export function isSession(spec: ActivitySpec): spec is SessionSpec {
  return spec.type === "session";
}
