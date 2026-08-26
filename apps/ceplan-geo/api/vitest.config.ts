import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["dist/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
      exclude: [
        "dist/**",
        "src/index.ts",
        "src/db/migrate.ts",
        "src/db/pool.ts",
        "src/ingest/run-discovery.ts",
        "src/ingest/run-territories.ts",
        "src/ingest/run-infrastructure.ts",
        "vitest.config.ts",
      ],
    },
  },
});
