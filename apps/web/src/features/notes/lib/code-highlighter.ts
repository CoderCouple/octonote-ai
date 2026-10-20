import { codeBlockOptions } from "@blocknote/code-block";
import { createBundledHighlighter } from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

/**
 * Code block highlighting: BlockNote's options (languages, picker, Tab to
 * indent) with Shiki's normal grammars instead of the pre-compiled ones
 * BlockNote ships.
 *
 * The pre-compiled grammars in @shikijs/langs-precompiled 4.5.0 get some
 * languages wrong: in Python a docstring over several lines never ends, so
 * everything after it shows as a string; Bash, Markdown, YAML, PHP, Vue and
 * Svelte drift too. The normal grammars on the same JavaScript engine match
 * Shiki's reference (Oniguruma) output. Each grammar still loads only when a
 * note uses that language. The languages are BlockNote's list.
 */
const LANGS = {
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  "c++": () => import("@shikijs/langs/cpp"),
  css: () => import("@shikijs/langs/css"),
  glsl: () => import("@shikijs/langs/glsl"),
  graphql: () => import("@shikijs/langs/graphql"),
  gql: () => import("@shikijs/langs/graphql"),
  haml: () => import("@shikijs/langs/haml"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  js: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsonl: () => import("@shikijs/langs/jsonl"),
  jsx: () => import("@shikijs/langs/jsx"),
  julia: () => import("@shikijs/langs/julia"),
  jl: () => import("@shikijs/langs/julia"),
  less: () => import("@shikijs/langs/less"),
  markdown: () => import("@shikijs/langs/markdown"),
  md: () => import("@shikijs/langs/markdown"),
  mdx: () => import("@shikijs/langs/mdx"),
  php: () => import("@shikijs/langs/php"),
  postcss: () => import("@shikijs/langs/postcss"),
  pug: () => import("@shikijs/langs/pug"),
  jade: () => import("@shikijs/langs/pug"),
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  r: () => import("@shikijs/langs/r"),
  regexp: () => import("@shikijs/langs/regexp"),
  regex: () => import("@shikijs/langs/regexp"),
  sass: () => import("@shikijs/langs/sass"),
  scss: () => import("@shikijs/langs/scss"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  bash: () => import("@shikijs/langs/shellscript"),
  sh: () => import("@shikijs/langs/shellscript"),
  shell: () => import("@shikijs/langs/shellscript"),
  zsh: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  svelte: () => import("@shikijs/langs/svelte"),
  typescript: () => import("@shikijs/langs/typescript"),
  ts: () => import("@shikijs/langs/typescript"),
  vue: () => import("@shikijs/langs/vue"),
  "vue-html": () => import("@shikijs/langs/vue-html"),
  wasm: () => import("@shikijs/langs/wasm"),
  wgsl: () => import("@shikijs/langs/wgsl"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
  yml: () => import("@shikijs/langs/yaml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescriptreact: () => import("@shikijs/langs/tsx"),
  haskell: () => import("@shikijs/langs/haskell"),
  hs: () => import("@shikijs/langs/haskell"),
  "c#": () => import("@shikijs/langs/csharp"),
  csharp: () => import("@shikijs/langs/csharp"),
};

const createHighlighter = createBundledHighlighter({
  langs: LANGS,
  themes: {
    "github-dark": () => import("@shikijs/themes/github-dark"),
    "github-light": () => import("@shikijs/themes/github-light"),
  },
  engine: () => createJavaScriptRegexEngine(),
});

export const octoCodeBlockOptions: typeof codeBlockOptions = {
  ...codeBlockOptions,
  createHighlighter: () => createHighlighter({ themes: ["github-dark", "github-light"], langs: [] }),
};
