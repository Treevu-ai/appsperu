import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `tsc` deja `dist/__tests__/*.test.js` tras `npm run build` — sin esto,
    // vitest corre cada test dos veces (fuente y compilado).
    exclude: ["**/node_modules/**", "**/dist/**"],
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
        "vitest.config.ts",
      ],
    },
  },
});
