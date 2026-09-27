import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `dist/` guarda copias compiladas de los tests. Correrlas es correr una
    // versión vieja del código sin que nadie lo note, y como además están
    // desactualizadas fallaban por cosas que el fuente ya no tenía.
    include: ["src/**/*.test.ts"],
    // `normalize.test.ts` y `ports.test.ts` siembran las mismas filas (mismo
    // `source_file`) en la misma base y las borran en su `afterAll`. En
    // paralelo, uno borra el lote mientras el otro todavía lo referencia y
    // revienta con violación de FK en `raw_batches`. No son suites
    // independientes: comparten estado, así que se ejecutan en secuencia.
    fileParallelism: false,
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
        "src/ingest/sunat-connector.ts",
        "vitest.config.ts",
      ],
    },
  },
});
