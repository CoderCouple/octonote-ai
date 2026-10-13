// Loads tldraw's pure-JS schema/store/utils packages (no DOM) from the pnpm store,
// pinned to the tldraw version apps/web uses.
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tldrawDir = realpathSync(path.join(root, "apps/web/node_modules/tldraw"));
const version = JSON.parse(readFileSync(path.join(tldrawDir, "package.json"), "utf8")).version;
const pnpmDir = path.join(root, "node_modules/.pnpm");
const load = (name) => {
  const prefix = `${name.replace("/", "+")}@${version}`;
  const entry = readdirSync(pnpmDir).find((d) => d === prefix || d.startsWith(`${prefix}_`));
  if (!entry) throw new Error(`${name}@${version} not found in node_modules/.pnpm`);
  return import(pathToFileURL(path.join(pnpmDir, entry, "node_modules", name, "dist-esm/index.mjs")).href);
};
export const tlschema = await load("@tldraw/tlschema");
export const tlstore = await load("@tldraw/store");
export const tlutils = await load("@tldraw/utils");
