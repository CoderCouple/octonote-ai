import { infographicSchema, TONES, type Tone, type ValidationResult } from "./schema.js";

type Raw = Record<string, unknown>;

const LEGACY_LAYOUT: Record<string, string> = { cards: "grid", process: "steps", stats: "stats", timeline: "timeline", bars: "bars" };

/**
 * Upgrades an infographic written in the first format (layouts cards,
 * process, stats, compare, timeline, bars; `groups`; `amount`; `value` as
 * text; `color`) so notes made before this library still render.
 */
export function upgradeLegacy(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const spec = input as Raw;
  const legacy = spec.layout === "cards" || spec.layout === "process" || spec.layout === "compare" || Array.isArray(spec.groups) || hasLegacyItems(spec.items);
  if (!legacy) return input;

  const item = (raw: unknown): Raw => {
    const it = { ...(raw as Raw) };
    if (typeof it.value === "string") {
      it.display ??= it.value;
      delete it.value;
    }
    if (typeof it.amount === "number") {
      it.value = it.amount;
      delete it.amount;
    }
    if (typeof it.color === "string") {
      if ((TONES as readonly string[]).includes(it.color)) it.tone = it.color as Tone;
      delete it.color;
    }
    return it;
  };

  const out: Raw = { ...spec };
  if (spec.layout === "compare" && Array.isArray(spec.groups)) {
    const groups = spec.groups as Raw[];
    out.layout = groups.length === 2 ? "versus" : "columns";
    out.items = groups.map((g) => {
      const { items, color, ...rest } = g;
      return { ...rest, ...(typeof color === "string" && (TONES as readonly string[]).includes(color) ? { tone: color } : {}), children: ((items as unknown[]) ?? []).map(item) };
    });
    delete out.groups;
  } else {
    if (typeof spec.layout === "string" && LEGACY_LAYOUT[spec.layout]) out.layout = LEGACY_LAYOUT[spec.layout];
    if (spec.layout === "cards") out.style ??= "badge";
    if (Array.isArray(spec.items)) out.items = spec.items.map(item);
  }
  return out;
}

function hasLegacyItems(items: unknown): boolean {
  return Array.isArray(items) && items.some((it) => it && typeof it === "object" && ("amount" in it || "color" in it || typeof (it as Raw).value === "string"));
}

/** Checks a spec (upgrading the first format). Never throws. */
export function validateInfographic(input: unknown): ValidationResult {
  const parsed = infographicSchema.safeParse(upgradeLegacy(input));
  if (parsed.success) return { ok: true, spec: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}
