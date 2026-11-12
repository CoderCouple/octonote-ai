import { compile, evaluate, type Scope } from "./expr.js";

/**
 * Data tables inside a widget: real numbers (population by year, prices,
 * results) that charts, bars, tables and values can read. Formulas stay
 * numeric; tables come in through declarations, never through new syntax.
 */
export interface DataColumn {
  name: string;
  label?: string;
  /** A column of words (countries, months) rather than numbers. */
  text?: boolean;
}

export interface DataTable {
  name: string;
  columns: DataColumn[];
  rows: (number | string)[][];
}

export type Aggregate = "sum" | "mean" | "min" | "max" | "count" | "first" | "last";

/** A row's numbers by column name, on top of the widget's scope. */
export function rowScope(table: DataTable, row: (number | string)[], scope: Scope): Scope {
  const values: Record<string, number> = { ...scope };
  table.columns.forEach((c, i) => {
    if (!c.text) values[c.name] = Number(row[i]);
  });
  return values;
}

const columnIndex = (table: DataTable, column: string) => table.columns.findIndex((c) => c.name === column);

/**
 * A column's value at `at`, interpolating along the table's first (numeric)
 * column, and holding the end values outside its range.
 */
export function lookup(table: DataTable, column: string, at: number, mode: "interpolate" | "step" = "interpolate"): number {
  const key = 0;
  const col = columnIndex(table, column);
  if (col < 0 || !Number.isFinite(at)) return NaN;
  const rows = table.rows
    .map((r) => [Number(r[key]), Number(r[col])] as const)
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((a, b) => a[0] - b[0]);
  if (!rows.length) return NaN;
  if (at <= rows[0]![0]) return rows[0]![1];
  if (at >= rows[rows.length - 1]![0]) return rows[rows.length - 1]![1];
  for (let i = 1; i < rows.length; i++) {
    const [x1, y1] = rows[i]!;
    if (at <= x1) {
      const [x0, y0] = rows[i - 1]!;
      if (mode === "step" || x1 === x0) return at === x1 ? y1 : y0;
      return y0 + ((y1 - y0) * (at - x0)) / (x1 - x0);
    }
  }
  return NaN;
}

/** A column summarised over the rows, optionally only those where `where` holds. */
export function aggregate(table: DataTable, column: string, op: Aggregate, scope: Scope, where?: string): number {
  const col = columnIndex(table, column);
  if (col < 0) return NaN;
  const filter = where ? compile(where) : undefined;
  const values = table.rows
    .filter((r) => !filter || !!evaluate(filter, rowScope(table, r, scope)))
    .map((r) => Number(r[col]))
    .filter(Number.isFinite);
  if (op === "count") return values.length;
  if (!values.length) return NaN;
  switch (op) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "first":
      return values[0]!;
    case "last":
      return values[values.length - 1]!;
  }
}
