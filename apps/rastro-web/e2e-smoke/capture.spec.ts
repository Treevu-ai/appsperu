import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import sectores from "../e2e/fixtures/sectores.json" with { type: "json" };
import proveedores from "../e2e/fixtures/proveedores.json" with { type: "json" };
import distritos from "../e2e/fixtures/distritos.json" with { type: "json" };

/**
 * AL3-20 — genera las capturas + texto renderizado que
 * docs/validacion-smoke-rastro-web-v1.md documenta. Reusa exactamente las
 * mismas fixtures que la suite de CI (AL3-14) — el "JSON crudo" del reporte
 * es literalmente el contenido de e2e/fixtures/*.json.
 */
const OUT_DIR = "../../docs/smoke-rastro-web";
mkdirSync(OUT_DIR, { recursive: true });

const manifest: { ruta: string; captura: string; texto: string }[] = [];

async function capture(page: import("@playwright/test").Page, name: string, url: string) {
  await page.goto(url);
  await page.waitForTimeout(300);
  const screenshotPath = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const texto = await page.locator("main").innerText();
  manifest.push({ ruta: url, captura: `${name}.png`, texto });
}

test("captura ficha de sector x5", async ({ page }) => {
  for (const sectorId of Object.keys(sectores)) {
    await page.route("**/radar-ejecucion/api/sectores/**/ficha**", (route) =>
      route.fulfill({ json: sectores[sectorId as keyof typeof sectores] }),
    );
    await capture(page, `ficha-${sectorId.toLowerCase()}`, `/gore/la-libertad/ficha?sector=${sectorId}&anio=2026`);
    await page.unroute("**/radar-ejecucion/api/sectores/**/ficha**");
  }
});

test("captura proveedor x3", async ({ page }) => {
  const resultados = Object.values(proveedores)
    .map((p) => p.supplierRow)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  await page.route("**/compras-publicas/api/suppliers**", (route) =>
    route.fulfill({ json: { resultados, concentracion: { cr3: 100, cr5: 100, hhi: 5000, proveedoresConsiderados: resultados.length } } }),
  );
  for (const [key, p] of Object.entries(proveedores)) {
    await page.route(`**/identidad-fiscal/api/contribuyentes/${p.ruc}`, (route) => route.fulfill({ json: p.identidad }));
    await page.route(`**/proveedores-sancionados/api/sanciones/${p.ruc}`, (route) => route.fulfill({ json: p.sanciones }));
    await capture(page, `proveedor-${key}`, `/proveedor/${p.ruc}`);
  }
});

test("captura distrito x2", async ({ page }) => {
  for (const [ubigeo, fixture] of Object.entries(distritos)) {
    await page.route("**/infobras/api/public-works**", (route) =>
      route.fulfill({ json: { items: fixture.items, resumen: fixture.resumen, cobertura: fixture.cobertura, matcher: fixture.matcher, corte: fixture.corte } }),
    );
    await capture(page, `distrito-${ubigeo}`, `/distrito/${ubigeo}`);
    await page.unroute("**/infobras/api/public-works**");
  }
});

test("captura estado", async ({ page }) => {
  await page.route("**/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/rate-limit-stats", (route) => route.fulfill({ json: { count429Last24h: 0 } }));
  await capture(page, "estado", "/estado");
});

test("captura buscar", async ({ page }) => {
  await page.route("**/api/search**", (route) =>
    route.fulfill({
      json: {
        q: "constructora",
        departamentoAlcance: "LA LIBERTAD",
        resultados: [
          { tipo: "ruc", identificador: "20100000001", descripcion: "CONSTRUCTORA EJEMPLO SAC", puntaje: 80, fuente: "identidad-fiscal / contribuyentes" },
        ],
        fuentesNoDisponibles: [],
        limitacion: "Solo identidad-fiscal soporta búsqueda de texto libre real. radar-inversiones e infobras se filtran en el borde (edge), acotados a LA LIBERTAD.",
      },
    }),
  );
  await page.goto("/buscar");
  await page.getByPlaceholder(/RUC, UBIGEO/).fill("constructora");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.waitForTimeout(500);
  const screenshotPath = `${OUT_DIR}/buscar.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const texto = await page.locator("main").innerText();
  manifest.push({ ruta: "/buscar (q=constructora)", captura: "buscar.png", texto });
});

test.afterAll(() => {
  writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
});
