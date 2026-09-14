import { test, expect } from "@playwright/test";
import obras from "./fixtures/obras-paralizadas.json" with { type: "json" };
import sancionados from "./fixtures/sancionados-nuevos.json" with { type: "json" };

/**
 * GORE-06b/06c/07b — ranking nacional de obras paralizadas + bloque de
 * sancionados nuevos en `/obras-paralizadas`.
 *
 * Dual patrón de rutas (igual que `ficha-sector.spec.ts`/`sector-nacional.spec.ts`):
 * Producción/CI usa `https://api.example.test/<app>/api/...` (ver
 * `.github/workflows/rastro-web-ci.yml`), dev local usa `http://localhost:<puerto>/api/...`
 * (sin prefijo de app, ver `.env`) — sin ambos patrones el test pasa en un
 * entorno y falla en el otro (confirmado: es la causa real de por qué
 * `distrito.spec.ts` falla hoy en local, registra solo el patrón de prod).
 */
function routeObras(page: import("@playwright/test").Page, onRequest?: (url: URL) => void) {
  const handler = async (route: import("@playwright/test").Route) => {
    onRequest?.(new URL(route.request().url()));
    await route.fulfill({ json: obras });
  };
  return Promise.all([
    page.route("**/infobras/api/public-works**", handler),
    page.route("**/api/public-works**", handler),
  ]);
}

function routeSancionados(page: import("@playwright/test").Page) {
  const handler = async (route: import("@playwright/test").Route) => {
    await route.fulfill({ json: sancionados });
  };
  return Promise.all([
    page.route("**/proveedores-sancionados/api/crossref**", handler),
    page.route("**/api/crossref**", handler),
  ]);
}

test("ranking nacional: orden de la tabla = orden del fixture (dias paralizado descendente) + sancionados nuevos visible", async ({
  page,
}) => {
  await routeObras(page);
  await routeSancionados(page);

  await page.goto("/obras-paralizadas");

  await expect(page.getByRole("heading", { name: `${obras.resultados.length} obras paralizadas` })).toBeVisible();

  // El orden que ve el usuario es el que devuelve la API (diasParalizado_desc,
  // el default de esta vista) — el componente no reordena en el cliente.
  // `.first()` porque la sección de "sancionados nuevos" (GORE-06c) tiene su
  // propia tabla debajo, en la misma página — sin esto el selector mezclaría
  // filas de ambas tablas.
  const nombresEnPantalla = await page.locator("table").first().locator("tbody tr td:first-child").allTextContents();
  expect(nombresEnPantalla).toEqual(obras.resultados.map((o) => o.nombreObra));
  // Confirma explícitamente el orden descendente por días (no solo que
  // coincide con el fixture — que el fixture mismo esté bien ordenado).
  const dias = obras.resultados.map((o) => o.diasParalizado);
  expect(dias).toEqual([...dias].sort((a, b) => b - a));

  // Bloque de sancionados nuevos (GORE-06c), independiente del ranking de obras.
  await expect(page.getByRole("heading", { name: "Sancionados nuevos (nacional)" })).toBeVisible();
  const sancionado = sancionados.resultados[0];
  await expect(page.getByText(sancionado.supplierName)).toBeVisible();
  await expect(page.getByText(sancionado.buyerName)).toBeVisible();
});

test("filtro de sector cambia el request real (debounced) — GORE-06a/06b", async ({ page }) => {
  const requestedUrls: URL[] = [];
  await routeObras(page, (url) => requestedUrls.push(url));
  await routeSancionados(page);

  await page.goto("/obras-paralizadas");
  await expect(page.getByRole("heading", { name: `${obras.resultados.length} obras paralizadas` })).toBeVisible();
  requestedUrls.length = 0; // solo interesa el request disparado por el filtro, no el inicial.

  await page.getByLabel("Sector (sector_entidad exacto de INFOBRAS)").fill("produce");

  await expect
    .poll(() => requestedUrls.some((u) => u.searchParams.get("sectorEntidad") === "PRODUCE"), {
      // > FILTER_DEBOUNCE_MS (400ms) de ObrasParalizadas.tsx.
      timeout: 3000,
    })
    .toBe(true);
});

test("sin obras para los filtros: mensaje explícito, no tabla vacía silenciosa", async ({ page }) => {
  await Promise.all([
    page.route("**/infobras/api/public-works**", (route) => route.fulfill({ json: { resultados: [] } })),
    page.route("**/api/public-works**", (route) => route.fulfill({ json: { resultados: [] } })),
  ]);
  await routeSancionados(page);

  await page.goto("/obras-paralizadas");

  await expect(
    page.getByText("Sin obras paralizadas para estos filtros. Prueba quitar el sector o bajar el mínimo de días."),
  ).toBeVisible();
});
