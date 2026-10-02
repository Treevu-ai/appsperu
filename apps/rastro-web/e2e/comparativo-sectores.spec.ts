import { test, expect } from "@playwright/test";
import comparativo from "./fixtures/comparativo.json" with { type: "json" };

/**
 * GORE-04a — comparativo sectorial: JSON de API = JSON renderizado.
 */
test("comparativo GORE: PIM/devengado y cobertura por fila = JSON de la API", async ({ page }) => {
  const fulfillComparativo = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: comparativo });
  };
  await page.route("**/radar-ejecucion/api/sectores/comparativo**", fulfillComparativo);
  await page.route("**/api/sectores/comparativo**", fulfillComparativo);

  await page.goto("/gore/la-libertad/comparativo?sectores=TRANSPORTE,SALUD&anio=2026");

  for (const row of comparativo.resultados) {
    await expect(page.getByText(row.pim.toLocaleString("es-PE"))).toBeVisible();
    await expect(page.getByText(row.devengado.toLocaleString("es-PE"))).toBeVisible();
    const coberturaUi =
      row.cobertura.estado === "NO_VERIFICADA" ? "BLOQUEADA" : row.cobertura.estado;
    await expect(page.getByText(coberturaUi, { exact: true })).toBeVisible();
  }

  await expect(page.getByText(comparativo.limitation)).toBeVisible();
});
