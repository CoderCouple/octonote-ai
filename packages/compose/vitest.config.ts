import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // Test against the libraries' source, so tests don't need a build first.
    alias: {
      "@octonote/interactive": source("../interactive/src/index.ts"),
      "@octonote/widgets": source("../widgets/src/index.ts"),
      "@octonote/motion": source("../motion/src/index.ts"),
    },
  },
  test: { environment: "jsdom" },
});
