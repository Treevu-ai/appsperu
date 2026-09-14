import { test, expect } from "@playwright/test";
import sectores from "./fixtures/sectores.json" with { type: "json" };

/**
 * AL3-14 / GORE-01a — fichas de sector con shape real de la API.
 */
const SECTOR_IDS = Object.keys(sectores) as (keyof typeof sectores)[];

function sumRegla(
  entidades: (typeof sectores.TRANSPORTE)["entidades"],
  regla: "META_DEPARTAMENTO" | "SEDE_EJECUTORA",
) {
  const rows = entidades.filter((row) => row.reglaTerritorial === regla);
  return {
    pia: rows.reduce((acc, row) => acc + row.pia, 0),
    pim: rows.reduce((acc, row) => acc + row.pim, 0),
    devengado: rows.reduce((acc, row) => acc + row.devengado, 0),
    entidades: rows.length,
  };
}

for (const sectorId of SECTOR_IDS) {
  test(`ficha de sector ${sectorId}: presupuesto por regla = JSON de la API`, async ({ page }) => {
    const fixture = sectores[sectorId];
    const meta = sumRegla(fixture.entidades, "META_DEPARTAMENTO");
    const sede = sumRegla(fixture.entidades, "SEDE_EJECUTORA");
    const cobertura = fixture.entidades.some((row) => row.cobertura.estado === "PARCIAL")
      ? "PARCIAL"
      : "COMPLETA";
    const corte = fixture.entidades.flatMap((row) => row.cortesUsados).sort().at(-1) ?? "—";

    const fulfillFicha = async (route: import("@playwright/test").Route) => {
      await route.fulfill({ json: fixture });
    };
    // Producción / CI: base https://api.example.test/radar-ejecucion → …/radar-ejecucion/api/…
    await page.route("**/radar-ejecucion/api/sectores/**/ficha**", fulfillFicha);
    // Dev local (.env): base http://localhost:4000 → …/api/sectores/… (sin prefijo de app)
    await page.route("**/api/sectores/**/ficha**", fulfillFicha);

    await page.goto(`/gore/la-libertad/ficha?sector=${sectorId}&anio=2026`);

    await expect(page.getByRole("heading", { name: sectorId, exact: true })).toBeVisible();
    await expect(page.getByText(cobertura, { exact: true })).toBeVisible();
    await expect(page.getByText(`corte: ${corte}`)).toBeVisible();

    if (meta.entidades > 0) {
      await expect(page.getByText(meta.pia.toLocaleString("es-PE"))).toBeVisible();
      await expect(page.getByText(meta.pim.toLocaleString("es-PE"))).toBeVisible();
      await expect(page.getByText(meta.devengado.toLocaleString("es-PE"))).toBeVisible();
    }
    if (sede.entidades > 0) {
      await expect(page.getByText(sede.pia.toLocaleString("es-PE"))).toBeVisible();
      await expect(page.getByText(sede.pim.toLocaleString("es-PE"))).toBeVisible();
      await expect(page.getByText(sede.devengado.toLocaleString("es-PE"))).toBeVisible();
    }

    if (sectorId === "TRANSPORTE") {
      await expect(page.getByRole("heading", { name: "Inversiones (CUI)" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "2456789" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Obras (INFOBRAS vía CUI)" })).toBeVisible();
      await expect(page.getByText("MEJORAMIENTO DE CARRETERA TRUJILLO - OTUZCO").first()).toBeVisible();
      await expect(page.getByText("PARALIZADA", { exact: true })).toBeVisible();
      await expect(page.getByText("120")).toBeVisible();
      await expect(page.getByText("+50.0%")).toBeVisible();
      await expect(page.getByText("+35.0 pp")).toBeVisible();
      await expect(page.getByText("Paralizadas: 1 · Gap |físico − financiero| > 20 pp: 1")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Contrataciones" })).toBeVisible();
      await expect(page.getByText("SERVICIO DE SUPERVISION DE OBRA VIAL")).toBeVisible();
    } else {
      await expect(page.getByText(fixture.limitation).first()).toBeVisible();
    }
  });
}
