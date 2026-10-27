// Builds the ChatGPT plugin ZIP from integrations/openai-plugin, with
// plugin.json at the archive root, onto the Desktop:
//   pnpm openai:plugin
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const src = new URL("../integrations/openai-plugin/", import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(join(src, "plugin.json"), "utf8"));
for (const f of ["plugin.json", "mcp.json"]) JSON.parse(readFileSync(join(src, f), "utf8")); // fail on bad JSON
const out = join(homedir(), "Desktop", `octonote-plugin-${version}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", out, "plugin.json", "mcp.json", "assets", "skills", "-x", "*.DS_Store"], { cwd: src, stdio: "inherit" });
console.log(`\n✓ ${out}`);
