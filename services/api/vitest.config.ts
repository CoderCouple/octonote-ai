import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // Load @octonote/content with Node itself, as production does: it imports
    // BlockNote's ES build natively, which Vitest's module sandbox can't.
    server: { deps: { external: [/@octonote\/content/, /packages\/content\//] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/db/schemas/**", "src/main.ts"],
    },
  },
});
