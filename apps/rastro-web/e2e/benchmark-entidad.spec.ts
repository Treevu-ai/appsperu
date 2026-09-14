import { test, expect } from "@playwright/test";
import benchmarkOk from "./fixtures/benchmark-ok.json" with { type: "json" };
import benchmarkInsuficiente from "./fixtures/benchmark-insuficiente.json" with { type: "json" };

/**
 * GORE-04b — benchmark de entidad: percentil ok vs datos_insuficientes.
 */
test("benchmark entidad 831: percentil = JSON ok", async ({ page }) => {
  const fulfillOk = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: benchmarkOk });
  };
  await page.route("**/radar-ejecucion/api/benchmark/831**", fulfillOk);
  await page.route("**/api/benchmark/831**", fulfillOk);

  await page.goto("/gore/la-libertad/benchmark?entityCode=831&anio=2026");

  await expect(page.getByText(`P${benchmarkOk.percentil}`)).toBeVisible();
  await expect(page.getByText(`${benchmarkOk.medianaAvancePct!.toFixed(1)}%`)).toBeVisible();
  await expect(page.getByText(`corte: ${benchmarkOk.fechaCorte}`)).toBeVisible();
});

test("benchmark entidad 999: datos_insuficientes = JSON de la API", async ({ page }) => {
  const fulfillInsuficiente = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: benchmarkInsuficiente });
  };
  await page.route("**/radar-ejecucion/api/benchmark/999**", fulfillInsuficiente);
  await page.route("**/api/benchmark/999**", fulfillInsuficiente);

  await page.goto("/gore/la-libertad/benchmark?entityCode=999&anio=2026");

  await expect(page.getByText("datos_insuficientes", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entidad 999" })).toBeVisible();
  await expect(page.getByText("La cohorte tiene solo")).toBeVisible();
  await expect(page.locator("span.mono-num.text-fg").filter({ hasText: /^2$/ })).toBeVisible();
  await expect(page.locator("span.mono-num.text-fg").filter({ hasText: /^5$/ })).toBeVisible();
  await expect(page.getByText(`corte: ${benchmarkInsuficiente.fechaCorte}`)).toBeVisible();
});
