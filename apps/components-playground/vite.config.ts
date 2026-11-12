import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { composeRoute } from "./server/compose.ts";
import { generateRoute } from "./server/generate.ts";

const pkg = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig(({ mode }) => {
  // The key stays in this dev server; the browser never sees it.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), generateRoute(env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY), composeRoute(env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY)],
    resolve: {
      // Use the libraries' source so edits reload instantly.
      alias: {
        "@octonote/interactive/examples": pkg("interactive/examples"),
        "@octonote/interactive/styles.css": pkg("interactive/styles.css"),
        "@octonote/interactive": pkg("interactive/src/index.ts"),
        "@octonote/widgets/examples": pkg("widgets/examples"),
        "@octonote/widgets/styles.css": pkg("widgets/styles.css"),
        "@octonote/widgets": pkg("widgets/src/index.ts"),
        "@octonote/motion/examples": pkg("motion/examples"),
        "@octonote/motion/styles.css": pkg("motion/styles.css"),
        "@octonote/motion": pkg("motion/src/index.ts"),
        "@octonote/compose/react": pkg("compose/src/react-entry.ts"),
        "@octonote/compose/styles.css": pkg("compose/styles.css"),
        "@octonote/compose": pkg("compose/src/index.ts"),
      },
    },
    server: { port: 5190 },
  };
});
