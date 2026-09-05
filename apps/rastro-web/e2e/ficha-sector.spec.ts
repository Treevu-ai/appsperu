import { test, expect } from "@playwright/test";
import sectores from "./fixtures/sectores.json" with { type: "json" };

/**
 * AL3-14 — 5 fichas de sector. Intercepta radar_ejecucion_sector_ficha con
 * una fixture fija y verifica que los 3 números clave (PIA/PIM/Devengado)
 * y la cobertura declarada aparezcan en el HTML renderizado tal cual vienen
 * en el JSON — no un valor derivado ni redondeado distinto.
 */
const SECTOR_IDS = Object.keys(sectores) as (keyof typeof sectores)[];

for (const sectorId of SECTOR_IDS) {
  test(`ficha de sector ${sectorId}: PIA/PIM/Devengado renderizados = JSON de la API`, async ({ page }) => {
    const fixture = sectores[sectorId];

    await page.route("**/radar-ejecucion/api/sectores/**/ficha**", async (route) => {
      await route.fulfill({ json: fixture });
    });

    await page.goto(`/gore/la-libertad/ficha?sector=${sectorId}&anio=2026`);

    await expect(page.getByRole("heading", { name: sectorId, exact: true })).toBeVisible();
    await expect(page.getByText(fixture.pia.toLocaleString("es-PE"))).toBeVisible();
    await expect(page.getByText(fixture.pim.toLocaleString("es-PE"))).toBeVisible();
    await expect(page.getByText(fixture.devengado.toLocaleString("es-PE"))).toBeVisible();
    await expect(page.getByText(fixture.cobertura, { exact: true })).toBeVisible();
    await expect(page.getByText(`corte: ${fixture.corte}`)).toBeVisible();
  });
}
