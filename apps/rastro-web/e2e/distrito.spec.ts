import { test, expect } from "@playwright/test";
import distritos from "./fixtures/distritos.json" with { type: "json" };

/**
 * AL3-14 — 2 distritos. Distrito.tsx mapea el prefijo de 2 dígitos del
 * UBIGEO a departamento y llama a infobras_public_works con ese
 * departamento (no hay filtro por distrito exacto en el backend real — ver
 * el comentario del propio componente). Se verifica que el conteo de obras
 * y el estado PARALIZADA vengan verbatim de la fixture.
 */
const UBIGEOS = Object.keys(distritos) as (keyof typeof distritos)[];

for (const ubigeo of UBIGEOS) {
  test(`distrito ${ubigeo}: obras y paralización = JSON de la API`, async ({ page }) => {
    const fixture = distritos[ubigeo];

    await page.route("**/infobras/api/public-works**", async (route) => {
      await route.fulfill({ json: { items: fixture.items, resumen: fixture.resumen, cobertura: fixture.cobertura, matcher: fixture.matcher, corte: fixture.corte } });
    });

    await page.goto(`/distrito/${ubigeo}`);

    await expect(page.getByText(`${fixture.items.length} obras`)).toBeVisible();
    for (const work of fixture.items) {
      await expect(page.getByText(work.descripcion)).toBeVisible();
      if (work.paralizada) {
        // exact:true para no matchear el resumen ("Paralizadas: 50.0% · ...")
        // — el chip real es un <span> cuyo texto es exactamente "PARALIZADA".
        await expect(page.getByText("PARALIZADA", { exact: true })).toBeVisible();
      }
    }
    await expect(page.getByText(fixture.cobertura, { exact: true }).first()).toBeVisible();
  });
}
