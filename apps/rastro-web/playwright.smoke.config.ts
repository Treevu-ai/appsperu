import { defineConfig, devices } from "@playwright/test";

/**
 * AL3-20 — captura de smoke test para docs/validacion-smoke-rastro-web-v1.md.
 * Config separada de playwright.config.ts (AL3-14, CI-gating): esto es un
 * script de mantenimiento que se corre manualmente para regenerar el
 * reporte, no un check que deba correr en cada PR.
 *
 * Uso: npx playwright test --config=playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: "./e2e-smoke",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 20_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview -- --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
