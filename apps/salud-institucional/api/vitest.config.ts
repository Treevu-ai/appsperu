import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
      exclude: [
        "src/index.ts",
        "src/db/**",
        "vitest.config.ts",
      ],
    },
  },
});
