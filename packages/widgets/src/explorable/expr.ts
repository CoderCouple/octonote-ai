/**
 * A tiny, safe formula language for widgets written by language models.
 * Numbers, names, + - * / % ^, comparisons, && || !, `c ? a : b` and a fixed
 * set of maths functions. It is parsed into a tree and evaluated by walking it:
 * nothing is ever passed to eval or Function, and there are no loops, strings,
 * objects or property access, so a formula can only compute a number.
 */

export type Expr =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: "-" | "!"; a: Expr }
  | { k: "bin"; op: BinOp; a: Expr; b: Expr }
  | { k: "call"; fn: string; args: Expr[] }
  | { k: "cond"; c: Expr; a: Expr; b: Expr };

type BinOp = "+" | "-" | "*" | "/" | "%" | "^" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&&" | "||";

export const MAX_FORMULA_LENGTH = 500;
const MAX_DEPTH = 40;

export const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Own-property lookup, so names like "constructor" never reach Object.prototype. */
const own = <T,>(table: Record<string, T>, key: string): T | undefined => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);
export const isConstant = (name: string) => own(CONSTANTS, name) !== undefined;
export const isFunction = (name: string) => own(FUNCTIONS, name) !== undefined;

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  for (let i = 0; b && i < 1000; i++) [a, b] = [b, a % b];
  return a;
}

/** Every function a formula may call, with its allowed argument counts. */
export const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...args: number[]) => number }> = {
  abs: { arity: [1, 1], fn: Math.abs },
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  cbrt: { arity: [1, 1], fn: Math.cbrt },
  exp: { arity: [1, 1], fn: Math.exp },
  ln: { arity: [1, 1], fn: Math.log },
  log: { arity: [1, 2], fn: (x, base = 10) => Math.log(x) / Math.log(base) },
  sin: { arity: [1, 1], fn: Math.sin },
  cos: { arity: [1, 1], fn: Math.cos },
  tan: { arity: [1, 1], fn: Math.tan },
  asin: { arity: [1, 1], fn: Math.asin },
  acos: { arity: [1, 1], fn: Math.acos },
  atan: { arity: [1, 1], fn: Math.atan },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  round: { arity: [1, 2], fn: (x, digits = 0) => Math.round(x * 10 ** digits) / 10 ** digits },
  sign: { arity: [1, 1], fn: Math.sign },
  min: { arity: [1, 20], fn: Math.min },
  max: { arity: [1, 20], fn: Math.max },
  pow: { arity: [2, 2], fn: Math.pow },
  clamp: { arity: [3, 3], fn: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
  gcd: { arity: [2, 2], fn: gcd },
  if: { arity: [3, 3], fn: (c, a, b) => (c ? a : b) },
};

export class FormulaError extends Error {}

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const OPERATORS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "!", "(", ")", ",", "?", ":"];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(source.slice(i));
    if (number) {
      tokens.push({ t: "num", v: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (name) {
      tokens.push({ t: "id", v: name[0] });
      i += name[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) throw new FormulaError(`Unexpected "${ch}"`);
    tokens.push({ t: "op", v: op });
    i += op.length;
  }
  return tokens;
}

/** Parses a formula, throwing FormulaError with a readable message when it's malformed. */
export function parseFormula(source: string): Expr {
  if (source.length > MAX_FORMULA_LENGTH) throw new FormulaError(`Longer than ${MAX_FORMULA_LENGTH} characters`);
  const tokens = tokenize(source);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`);
    pos++;
  };
  const deeper = <T>(fn: () => T): T => {
    if (++depth > MAX_DEPTH) throw new FormulaError("Formula is nested too deeply");
    try {
      return fn();
    } finally {
      depth--;
    }
  };

  const binary = (ops: string[], next: () => Expr) => () => {
    let left = next();
    while (peek()?.t === "op" && ops.includes(peek()!.v as string)) {
      const op = tokens[pos++]!.v as BinOp;
      left = { k: "bin", op, a: left, b: next() };
    }
    return left;
  };

  const conditional = (): Expr =>
    deeper(() => {
      const c = or();
      if (!isOp("?")) return c;
      pos++;
      const a = conditional();
      expect(":");
      return { k: "cond", c, a, b: conditional() };
    });
  const power = (): Expr => {
    const base = primary();
    if (!isOp("^")) return base;
    pos++;
    // Right-associative, and binds tighter than unary minus on its left: -2^2 = -4.
    return { k: "bin", op: "^", a: base, b: unary() };
  };
  const unary = (): Expr =>
    deeper(() => {
      if (isOp("-") || isOp("!")) {
        const op = tokens[pos++]!.v as "-" | "!";
        return { k: "un", op, a: unary() };
      }
      if (isOp("+")) {
        pos++;
        return unary();
      }
      return power();
    });
  const multiplicative = binary(["*", "/", "%"], unary);
  const additive = binary(["+", "-"], multiplicative);
  const comparison = binary(["<", "<=", ">", ">=", "==", "!="], additive);
  const and = binary(["&&"], comparison);
  const or = binary(["||"], and);

  function primary(): Expr {
    const token = tokens[pos++];
    if (!token) throw new FormulaError("Formula ends too early");
    if (token.t === "num") return { k: "num", v: token.v };
    if (token.t === "id") {
      if (!isOp("(")) return { k: "var", name: token.v };
      const spec = own(FUNCTIONS, token.v);
      if (!spec) throw new FormulaError(`Unknown function "${token.v}"`);
      pos++;
      const args: Expr[] = [];
      if (!isOp(")")) {
        do args.push(conditional());
        while (isOp(",") && ++pos);
      }
      expect(")");
      if (args.length < spec.arity[0] || args.length > spec.arity[1]) throw new FormulaError(`${token.v}() takes ${spec.arity[0] === spec.arity[1] ? spec.arity[0] : `${spec.arity[0]} to ${spec.arity[1]}`} arguments`);
      return { k: "call", fn: token.v, args };
    }
    if (token.v === "(") {
      const inner = conditional();
      expect(")");
      return inner;
    }
    throw new FormulaError(`Unexpected "${token.v}"`);
  }

  if (!tokens.length) throw new FormulaError("Formula is empty");
  const tree = conditional();
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${(tokens[pos] as Token).v}"`);
  return tree;
}

/** Names a formula reads (not functions or constants). */
export function namesIn(expr: Expr, into = new Set<string>()): Set<string> {
  switch (expr.k) {
    case "var":
      if (!isConstant(expr.name)) into.add(expr.name);
      break;
    case "un":
      namesIn(expr.a, into);
      break;
    case "bin":
      namesIn(expr.a, into);
      namesIn(expr.b, into);
      break;
    case "call":
      expr.args.forEach((arg) => namesIn(arg, into));
      break;
    case "cond":
      namesIn(expr.c, into);
      namesIn(expr.a, into);
      namesIn(expr.b, into);
      break;
  }
  return into;
}

export type Scope = Readonly<Record<string, number>>;

/** Evaluates a parsed formula. Unknown names are NaN; results that aren't finite are NaN. */
export function evaluate(expr: Expr, scope: Scope): number {
  const value = run(expr, scope);
  return Number.isFinite(value) ? value : NaN;
}

function run(e: Expr, s: Scope): number {
  switch (e.k) {
    case "num":
      return e.v;
    case "var":
      return Object.prototype.hasOwnProperty.call(s, e.name) ? s[e.name]! : (own(CONSTANTS, e.name) ?? NaN);
    case "un":
      return e.op === "-" ? -run(e.a, s) : run(e.a, s) ? 0 : 1;
    case "cond":
      return run(e.c, s) ? run(e.a, s) : run(e.b, s);
    case "call":
      return own(FUNCTIONS, e.fn)!.fn(...e.args.map((arg) => run(arg, s)));
    case "bin": {
      const a = run(e.a, s);
      if (e.op === "&&") return a ? (run(e.b, s) ? 1 : 0) : 0;
      if (e.op === "||") return a ? 1 : run(e.b, s) ? 1 : 0;
      const b = run(e.b, s);
      switch (e.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        case "^":
          return a ** b;
        case "<":
          return a < b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        case "!=":
          return a !== b ? 1 : 0;
      }
    }
  }
}

const cache = new Map<string, Expr>();

/** Parses once and remembers. Throws FormulaError for bad formulas. */
export function compile(source: string): Expr {
  let tree = cache.get(source);
  if (!tree) {
    tree = parseFormula(source);
    if (cache.size > 2000) cache.clear();
    cache.set(source, tree);
  }
  return tree;
}

export function evaluateFormula(source: string, scope: Scope): number {
  return evaluate(compile(source), scope);
}
