import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `tsconfig.json` incluye `src`, así que `npm run build` compila también los
    // tests dentro de `dist`. Sin este exclude, vitest corre cada test dos veces
    // —la segunda con la copia ya compilada, potencialmente desactualizada— y el
    // reporte de coverage se distorsiona. En CI no se nota porque el orden de los
    // steps es test antes que build.
    exclude: [...configDefaults.exclude, "dist/**"],
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