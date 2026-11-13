// Builds the extension into dist/ (load it unpacked from there).
//   node build.mjs            the store build: talks only to octonote.ai
//   node build.mjs --local    also offers a local Octonote (localhost:3000 / :4000) for development
//   --watch                   rebuilds on change
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const local = process.argv.includes("--local");
// OCTONOTE_OUT builds somewhere other than dist/ (end-to-end tests), leaving the dev build alone.
const out = process.env.OCTONOTE_OUT ?? "dist";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

/** Where Octonote lives. The extension only ever talks to these; pages can't change them. */
const ENVIRONMENTS = [
  {
    id: "octonote",
    label: "Octonote",
    web: "https://octonote.ai",
    webOrigins: ["https://octonote.ai", "https://www.octonote.ai"],
    api: "https://api.octonote.ai",
  },
  ...(local
    ? [
        {
          id: "local",
          label: "Local development",
          // OCTONOTE_LOCAL_WEB / OCTONOTE_LOCAL_API point a local build elsewhere (end-to-end tests).
          web: process.env.OCTONOTE_LOCAL_WEB ?? "http://localhost:3000",
          webOrigins: process.env.OCTONOTE_LOCAL_WEB
            ? [process.env.OCTONOTE_LOCAL_WEB]
            : ["http://localhost:3000", "http://127.0.0.1:3000"],
          api: process.env.OCTONOTE_LOCAL_API ?? "http://localhost:4000",
        },
      ]
    : []),
];

const CHAT_SITES = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
];

const manifest = {
  manifest_version: 3,
  name: local ? "Octonote Clipper (local)" : "Octonote Clipper",
  short_name: "Octonote Clipper",
  version: pkg.version,
  description:
    "Clip the parts of ChatGPT, Claude and Gemini answers you want into Octonote collections, then write a cited note from just those.",
  minimum_chrome_version: "116",
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  // activeTab: the page you right-click or use the shortcut on, only then (no install warning).
  permissions: ["storage", "contextMenus", "sidePanel", "activeTab"],
  host_permissions: ENVIRONMENTS.map((e) => `${e.api}/*`),
  background: { service_worker: "background.js", type: "module" },
  action: {
    default_title: "Open Octonote Clipper",
    default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png" },
  },
  side_panel: { default_path: "panel.html" },
  commands: {
    _execute_action: {
      suggested_key: { default: "Alt+Shift+O" },
      description: "Open Octonote Clipper",
    },
    "clip-selection": {
      suggested_key: { default: "Alt+Shift+C" },
      description: "Clip the selected text",
    },
  },
  content_scripts: [
    { matches: CHAT_SITES, js: ["clipper.js"], run_at: "document_idle" },
    {
      matches: ENVIRONMENTS.flatMap((e) => e.webOrigins.map((o) => `${o}/workspace/extension*`)),
      js: ["connect.js"],
      run_at: "document_start",
    },
  ],
  content_security_policy: {
    extension_pages: `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src ${ENVIRONMENTS.map((e) => e.api).join(" ")}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
  },
};

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/fonts`, { recursive: true });
cpSync("public", out, { recursive: true });
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
// The app's design tokens and typeface, so the panel looks like Octonote.
// Radii, shadows and type sizes live in a Tailwind-only `@theme inline` block, which browsers
// ignore; outside Tailwind they're ordinary custom properties.
writeFileSync(
  `${out}/tokens.css`,
  readFileSync("../../packages/design-tokens/tokens.css", "utf8").replace(/@theme\s+inline\s*\{/, ":root {"),
);
const require = createRequire(import.meta.url);
const inter = dirname(require.resolve("@fontsource-variable/inter/package.json"));
cpSync(join(inter, "files/inter-latin-wght-normal.woff2"), `${out}/fonts/inter.woff2`);

const define = {
  __ENVIRONMENTS__: JSON.stringify(ENVIRONMENTS),
  __CHAT_ORIGINS__: JSON.stringify(CHAT_SITES.map((s) => s.replace("/*", ""))),
};
const shared = { outdir: out, bundle: true, target: "chrome116", logLevel: "info", define, legalComments: "none" };
// Content scripts can't be modules: wrap them.
const contentOptions = {
  ...shared,
  entryPoints: { clipper: "src/clipper.ts", connect: "src/connect.ts" },
  format: "iife",
};
const pageOptions = {
  ...shared,
  entryPoints: { background: "src/background.ts", panel: "src/panel.ts" },
  format: "esm",
};

if (watch) {
  for (const o of [contentOptions, pageOptions]) await (await esbuild.context(o)).watch();
} else {
  await Promise.all([esbuild.build(contentOptions), esbuild.build(pageOptions)]);
}
