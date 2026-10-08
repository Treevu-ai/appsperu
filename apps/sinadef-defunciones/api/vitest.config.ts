import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `dist/` guarda copias compiladas de los tests: correrlas es correr una
    // versión vieja del código sin que nadie lo note.
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
