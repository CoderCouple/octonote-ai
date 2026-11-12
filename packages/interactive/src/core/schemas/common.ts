import { z } from "zod/v4";
import { LIMITS } from "../limits.js";

/** The version this library writes. It reads any 1.x spec. */
export const SCHEMA_VERSION = "1.0";

export const schemaVersionSchema = z
  .string()
  .regex(/^1\.\d+$/, `Unsupported schemaVersion; this library reads 1.x (current ${SCHEMA_VERSION})`)
  .describe(`Always "${SCHEMA_VERSION}".`);

export const idSchema = z
  .string()
  .min(1)
  .max(LIMITS.idLength)
  .regex(/^[A-Za-z0-9_.:-]+$/, "Use only letters, digits, _ . : or -")
  .describe("Short stable id, unique within its list, e.g. card-1.");

export const titleSchema = z.string().trim().min(1).max(LIMITS.titleLength);
export const textSchema = z.string().trim().min(1).max(LIMITS.textLength);

/** Fields every activity spec has. */
export function activityFields<T extends string>(type: T) {
  return {
    schemaVersion: schemaVersionSchema,
    type: z.literal(type),
    id: idSchema,
    title: titleSchema.optional(),
    description: textSchema.optional().describe("One or two sentences shown above the activity."),
  };
}

/** The structural part of zod's refinement context that the checks below use. */
export interface IssueSink {
  addIssue(issue: { code: "custom"; message: string; path: (string | number)[] }): void;
}

export function checkUniqueIds(items: readonly { id: string }[], ctx: IssueSink, path: (string | number)[]) {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: "custom", message: `Duplicate id "${item.id}"`, path: [...path, i, "id"] });
    }
    seen.add(item.id);
  });
}
