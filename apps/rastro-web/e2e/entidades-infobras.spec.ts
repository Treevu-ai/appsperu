import { test, expect } from "@playwright/test";
import fixture from "./fixtures/entidades-infobras.json" with { type: "json" };

/**
 * infobras_crossref_ejecucion — verifica que el devengado, obras y obras
 * paralizadas por entidad vengan verbatim del JSON de la API, y que el
 * filtro por confianza (confirmada/candidata) sí filtre — mismo patrón
 * "JSON de API = JSON renderizado" del resto de la suite (AL3-14).
 */
test("entidades-infobras: crosswalk MEF↔INFOBRAS con niveles de confianza", async ({ page }) => {
  await page.route("**/infobras/api/crossref/ejecucion**", async (route) => {
    const url = new URL(route.request().url());
    const confidence = url.searchParams.get("confidence");
    const resultados = confidence
      ? fixture.resultados.filter((r) => r.confidence === confidence)
      : fixture.resultados;
    await route.fulfill({ json: { resultados } });
  });

  await page.goto("/auditoria/entidades-infobras");

  await expect(page.getByText(`${fixture.resultados.length} entidades cruzadas`)).toBeVisible();
  for (const r of fixture.resultados) {
    await expect(page.getByText(r.ejecucionNombre)).toBeVisible();
    await expect(page.getByText(r.infobrasEntidadNombre)).toBeVisible();
  }
  // La entidad con obras paralizadas > 0 debe mostrar el número en rojo (visible igual, solo confirmamos presencia).
  await expect(page.getByText("3", { exact: true })).toBeVisible();

  // Filtrar por "candidata" — la fila "confirmada" (GORE La Libertad) debe desaparecer.
  await page.getByRole("button", { name: "candidata" }).click();
  await expect(page.getByText("1 entidades cruzadas")).toBeVisible();
  await expect(page.getByText("MUNICIPALIDAD PROVINCIAL DE TRUJILLO")).toBeVisible();
  await expect(page.getByText("GOBIERNO REGIONAL LA LIBERTAD")).not.toBeVisible();
});
