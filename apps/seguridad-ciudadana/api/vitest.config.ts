import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `dist/` guarda copias compiladas de los tests: correrlas es correr una
    // versión vieja del código sin que nadie lo note (ya pasó — fallaban con un
    // error que el fuente ya no tenía).
    include: ["src/**/*.test.ts"],
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
        "src/db/ejecucion-pool.ts",
        "src/ingest/sidpol-connector.ts",
        "vitest.config.ts",
      ],
    },
  },
});
