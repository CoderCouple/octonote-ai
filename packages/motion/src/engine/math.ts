import type { Scene } from "../schema.js";

/**
 * TeX typeset to vector paths with MathJax. The output is plain SVG geometry
 * (no fonts, no CSS, no HTML), so it measures exactly, renders the same in
 * every browser and survives video export.
 */
export interface TypesetMath {
  /** Inner SVG markup: only g, path, rect and line elements. */
  body: string;
  viewBox: [number, number, number, number];
  /** Size in ems (multiply by the font size for units). */
  width: number;
  height: number;
}

export interface MathTypesetter {
  typeset(tex: string): TypesetMath | { error: string };
}

/** Anything but these elements means the output isn't the geometry we expect. */
const ALLOWED = /<(?!\/?(?:svg|g|path|rect|line)[\s>/])/;
const MAX_CACHE = 500;
/** Paint values \color may produce: names, hex and rgb(), never url() or anything else. */
const COLOR_VALUE = /^(?:currentColor|none|transparent|[a-zA-Z]{1,20}|#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\))$/;

let loading: Promise<MathTypesetter> | undefined;

/** Loads MathJax once (it's large, so only when a scene has math). */
export function loadMath(): Promise<MathTypesetter> {
  loading ??= create().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

async function create(): Promise<MathTypesetter> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
  ]);
  // Base, AMS and colour only: no \href, \style, \class, \unicode or \require.
  await Promise.all([
    import("mathjax-full/js/input/tex/base/BaseConfiguration.js"),
    import("mathjax-full/js/input/tex/ams/AmsConfiguration.js"),
    import("mathjax-full/js/input/tex/color/ColorConfiguration.js"),
  ]);
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document("", { InputJax: new TeX({ packages: ["base", "ams", "color"] }), OutputJax: new SVG({ fontCache: "none" }) });
  const cache = new Map<string, TypesetMath | { error: string }>();

  const typeset = (tex: string): TypesetMath | { error: string } => {
    const html = adaptor.outerHTML(doc.convert(tex, { display: true }));
    const error = /data-mjx-error="([^"]*)"/.exec(html);
    if (error) return { error: error[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&") };
    const svg = /<svg\b[^>]*viewBox="([-\d.\s]+)"[^>]*>([\s\S]*)<\/svg>/.exec(html);
    const box = svg?.[1]!.trim().split(/\s+/).map(Number);
    if (!svg || !box || box.length !== 4 || box.some((n) => !Number.isFinite(n))) return { error: "Couldn't typeset this formula" };
    const body = svg[2]!;
    if (ALLOWED.test(body)) return { error: "Unexpected output for this formula" };
    for (const [, value] of body.matchAll(/(?:fill|stroke)="([^"]*)"/g)) {
      if (!COLOR_VALUE.test(value!)) return { error: `Unsupported colour "${value}"; use a colour name or #rrggbb` };
    }
    return { body, viewBox: box as [number, number, number, number], width: box[2]! / 1000, height: box[3]! / 1000 };
  };

  return {
    typeset(tex) {
      let result = cache.get(tex);
      if (!result) {
        try {
          result = typeset(tex);
        } catch (error) {
          result = { error: (error as Error).message || "Couldn't typeset this formula" };
        }
        if (cache.size > MAX_CACHE) cache.clear();
        cache.set(tex, result);
      }
      return result;
    },
  };
}

export const hasMath = (scene: Scene) => scene.elements.some((el) => el.shape === "math");

/** Formulas MathJax can't typeset, as issues a model can fix. */
export function mathIssues(scene: Scene, math: MathTypesetter): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  scene.elements.forEach((el, i) => {
    if (el.shape !== "math") return;
    const result = math.typeset(el.tex);
    if ("error" in result) issues.push({ path: `elements.${i}.tex`, message: `TeX error: ${result.error}. Use standard LaTeX maths (base and AMS commands, plus \\color).` });
  });
  return issues;
}
