import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `tsc` writes compiled tests under dist/. Vitest must only execute the
    // source suite; otherwise each test runs twice after a production build.
    exclude: ["node_modules/**", "dist/**"],
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
        "src/db/radar-pool.ts",
        "src/ingest/oece-connector.ts",
        "src/ingest/oece-records-connector.ts",
        "src/crossref/build-crosswalk.ts",
        "vitest.config.ts",
      ],
    },
  },
});
