import { test, expect } from "@playwright/test";
import ficha from "./fixtures/gore-la-libertad-ficha-minima.json" with { type: "json" };
import sancionados from "./fixtures/gore-proveedores-sancionados.json" with { type: "json" };
import identidadFiscal from "./fixtures/gore-identidad-fiscal-crossref.json" with { type: "json" };

/**
 * CX-01 en GORE La Libertad (S3) — `ProveedoresRiesgoSection` en
 * `/gore/la-libertad/ficha`, con los dos crossref de CX-01
 * (proveedores-sancionados + identidad-fiscal). Sección independiente del
 * sector/año seleccionados arriba (el backend no filtra por sector), así
 * que solo necesitamos un fixture mínimo de la ficha para que la página
 * cargue.
 *
 * Dual patrón de rutas (igual que `ficha-sector.spec.ts`/`obras-paralizadas.spec.ts`):
 * Producción/CI usa `https://api.example.test/<app>/api/...`, dev local usa
 * `http://localhost:<puerto>/api/...` sin prefijo de app — acá con la
 * particularidad de que proveedores-sancionados (4008) e identidad-fiscal
 * (4006) comparten literalmente el mismo path `/api/crossref`, así que el
 * patrón de dev local debe distinguir por puerto, no solo por path.
 */
function routeFicha(page: import("@playwright/test").Page) {
  const handler = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: ficha });
  };
  return Promise.all([
    page.route("**/radar-ejecucion/api/sectores/**/ficha**", handler),
    page.route("**/api/sectores/**/ficha**", handler),
  ]);
}

function routeSancionados(page: import("@playwright/test").Page) {
  const handler = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: sancionados });
  };
  return Promise.all([
    page.route("**/proveedores-sancionados/api/crossref**", handler),
    page.route("**localhost:4008/api/crossref**", handler),
  ]);
}

function routeIdentidadFiscal(page: import("@playwright/test").Page) {
  const handler = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: identidadFiscal });
  };
  return Promise.all([
    page.route("**/identidad-fiscal/api/crossref**", handler),
    page.route("**localhost:4006/api/crossref**", handler),
  ]);
}

test("ficha GORE La Libertad: sección de riesgo de proveedores = JSON de ambos crossref (CX-01)", async ({
  page,
}) => {
  await routeFicha(page);
  await routeSancionados(page);
  await routeIdentidadFiscal(page);

  await page.goto("/gore/la-libertad/ficha?sector=TRANSPORTE&anio=2026");

  await expect(page.getByRole("heading", { name: "Riesgo de proveedores en La Libertad" })).toBeVisible();

  // Subsección de sanciones (proveedores-sancionados) — una fila por origen del fixture.
  const sancionadosHeading = page.getByRole("heading", { name: "Proveedores sancionados con contrato vigente" });
  await expect(sancionadosHeading).toBeVisible();
  const tablaSancionados = page.locator("table").filter({ has: page.getByText("Fecha adjudicación") });
  const proveedoresSancionados = await tablaSancionados.locator("tbody tr td:first-child").allTextContents();
  expect(proveedoresSancionados).toEqual(sancionados.resultados.map((r) => r.supplierName));
  await expect(tablaSancionados.getByText("Adjudicación (OCDS)")).toBeVisible();
  await expect(tablaSancionados.getByText("Contrato menor (SEACE)")).toBeVisible();

  // Subsección de irregularidad tributaria (identidad-fiscal).
  const irregularesHeading = page.getByRole("heading", { name: "Proveedores con estado tributario irregular" });
  await expect(irregularesHeading).toBeVisible();
  const tablaIrregulares = page.locator("table").filter({ has: page.getByText("Condición domicilio") });
  const proveedoresIrregulares = await tablaIrregulares.locator("tbody tr td:first-child").allTextContents();
  expect(proveedoresIrregulares).toEqual(identidadFiscal.resultados.map((r) => r.supplierName));
  await expect(tablaIrregulares.getByText("BAJA PROVISIONAL")).toBeVisible();
  await expect(tablaIrregulares.getByText("NO HABIDO")).toBeVisible();
});
