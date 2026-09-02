import { test, expect } from "@playwright/test";
import distritos from "./fixtures/distritos.json" with { type: "json" };

/**
 * AL3-14 / AL3-09 — 2 distritos. Distrito.tsx mapea el prefijo de 2 dígitos
 * del UBIGEO a departamento y llama a infobras_public_works +
 * radar_ejecucion_infrastructure_assets con ese departamento (ninguno de
 * los dos filtra por distrito exacto en el backend real), y resuelve el
 * distrito exacto vía ceplan_geo_territories para filtrar en el cliente
 * (AL3-09). El fixture 130101 trae 2 obras en distritos distintos dentro
 * del mismo departamento a propósito, para verificar que el filtrado
 * exacto SÍ excluye la que no matchea (INF-002, EL PORVENIR).
 */
const UBIGEOS = Object.keys(distritos) as (keyof typeof distritos)[];

for (const ubigeo of UBIGEOS) {
  test(`distrito ${ubigeo}: obras y paralización = JSON de la API`, async ({ page }) => {
    const fixture = distritos[ubigeo];
    const expected = fixture.resultados.filter((w) => w.distrito === fixture.distrito);

    await page.route("**/infobras/api/public-works**", async (route) => {
      await route.fulfill({ json: { resultados: fixture.resultados } });
    });
    await page.route("**/ceplan-geo/api/territories**", async (route) => {
      await route.fulfill({ json: { ubigeo, departamento: fixture.departamento, provincia: null, distrito: fixture.distrito, geometry: null } });
    });
    await page.route("**/radar-ejecucion/api/infraestructura/activos**", async (route) => {
      await route.fulfill({ json: { departamento: fixture.departamento, sector: null, resultados: [], cautela: "" } });
    });

    await page.goto(`/distrito/${ubigeo}`);

    await expect(page.getByText(`${expected.length} obras`)).toBeVisible();
    for (const work of expected) {
      await expect(page.getByText(work.nombreObra)).toBeVisible();
      if (work.existeParalizacion) {
        // exact:true para no matchear el resumen ("Paralizadas: 50.0% · ...")
        // — el chip real es un <span> cuyo texto es exactamente "PARALIZADA".
        await expect(page.getByText("PARALIZADA", { exact: true })).toBeVisible();
      }
      if (work.costDriftPct != null) {
        const sign = work.costDriftPct > 0 ? "+" : "";
        await expect(page.getByText(`${sign}${work.costDriftPct.toFixed(1)}%`, { exact: true })).toBeVisible();
      }
    }
    // La obra que NO pertenece al distrito exacto debe quedar excluida.
    const excluded = fixture.resultados.filter((w) => w.distrito !== fixture.distrito);
    for (const work of excluded) {
      await expect(page.getByText(work.nombreObra)).not.toBeVisible();
    }
  });
}
