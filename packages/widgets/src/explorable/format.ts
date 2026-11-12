import { compile, evaluate, FormulaError, namesIn, type Scope } from "./expr.js";

/**
 * How a number is shown. `percent` expects a ratio (0.35 → 35%); for a value
 * that is already a percentage use `suffix: "%"`.
 */
export interface NumberFormat {
  style?: "number" | "currency" | "percent" | "compact";
  decimals?: number;
  currency?: string;
  prefix?: string;
  suffix?: string;
  /** Show + for positive numbers, e.g. for changes. */
  signed?: boolean;
  /** Thousands separators; false for years (2024, not 2,024). */
  grouping?: boolean;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(format: NumberFormat, locale?: string): Intl.NumberFormat {
  const key = JSON.stringify([format.style, format.decimals, format.currency, format.signed, format.grouping, locale]);
  let f = formatters.get(key);
  if (!f) {
    const decimals = format.decimals;
    const options: Intl.NumberFormatOptions = {
      signDisplay: format.signed ? "exceptZero" : "auto",
      useGrouping: format.grouping ?? true,
      ...(decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : { maximumFractionDigits: 2 }),
    };
    if (format.style === "currency") {
      Object.assign(options, { style: "currency", currency: format.currency ?? "USD" });
      if (decimals === undefined) Object.assign(options, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else if (format.style === "percent") {
      options.style = "percent";
      if (decimals === undefined) Object.assign(options, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    } else if (format.style === "compact") {
      options.notation = "compact";
      if (decimals === undefined) options.maximumFractionDigits = 1;
    }
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      // An unknown currency code falls back to a plain number.
      f = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    }
    formatters.set(key, f);
  }
  return f;
}

/** Formats a number for display. Missing or impossible values show as a dash. */
export function formatNumber(value: number, format: NumberFormat = {}, locale?: string): string {
  if (!Number.isFinite(value)) return "—";
  return `${format.prefix ?? ""}${formatter(format, locale).format(value === 0 ? 0 : value)}${format.suffix ?? ""}`;
}

/** Short format names usable inside text templates: {balance|currency}. */
export const TEMPLATE_FORMATS: Record<string, NumberFormat> = {
  number: {},
  int: { decimals: 0 },
  "0": { decimals: 0 },
  "1": { decimals: 1 },
  "2": { decimals: 2 },
  "3": { decimals: 3 },
  currency: { style: "currency" },
  currency2: { style: "currency", decimals: 2 },
  percent: { style: "percent" },
  compact: { style: "compact" },
  signed: { signed: true },
  "signed-currency": { style: "currency", signed: true },
  year: { decimals: 0, grouping: false },
};

export type TemplatePart = string | { formula: string; format?: string };

/** Splits "y = {m}x + {b|1}" into text and formula parts. Throws FormulaError on bad parts. */
export function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const pattern = /\{([^{}]*)\}/g;
  let last = 0;
  for (let match = pattern.exec(template); match; match = pattern.exec(template)) {
    if (match.index > last) parts.push(template.slice(last, match.index));
    const [formula, format] = match[1]!.split("|").map((s) => s.trim());
    if (!formula) throw new FormulaError("Empty {} in text");
    if (format !== undefined && !(format in TEMPLATE_FORMATS)) throw new FormulaError(`Unknown format "${format}"; use ${Object.keys(TEMPLATE_FORMATS).join(", ")}`);
    compile(formula);
    parts.push(format ? { formula, format } : { formula });
    last = pattern.lastIndex;
  }
  if (last < template.length) parts.push(template.slice(last));
  return parts;
}

export function templateNames(template: string): Set<string> {
  const names = new Set<string>();
  for (const part of parseTemplate(template)) if (typeof part !== "string") namesIn(compile(part.formula), names);
  return names;
}

/** Fills a template from the current values. */
export function renderTemplate(template: string, scope: Scope, currency?: string): string {
  return parseTemplate(template)
    .map((part) => {
      if (typeof part === "string") return part;
      const format = { ...TEMPLATE_FORMATS[part.format ?? "number"], ...(currency ? { currency } : {}) };
      return formatNumber(evaluate(compile(part.formula), scope), format);
    })
    .join("");
}
