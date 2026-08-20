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
        "src/db/migrate.ts",
        "src/db/pool.ts",
        "src/db/compras-pool.ts",
        "src/ingest/padron-connector.ts",
        "vitest.config.ts",
      ],
    },
  },
});
