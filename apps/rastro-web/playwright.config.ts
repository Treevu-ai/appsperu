import { defineConfig, devices } from "@playwright/test";

/**
 * AL3-14 — "JSON de API = JSON renderizado".
 *
 * Corre contra `vite preview` (build de producción), no contra `vite dev`,
 * para probar lo mismo que se despliega. Las respuestas de las 14 APIs se
 * interceptan con `page.route` usando fixtures fijas (e2e/fixtures/) — no
 * depende de Postgres ni de las APIs corriendo, para que CI sea determinista
 * y no dependa de datos reales que cambian. Cada test compara texto
 * renderizado contra el valor exacto de la fixture (no contra un snapshot).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "e2e-results.json" }]] : "list",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
