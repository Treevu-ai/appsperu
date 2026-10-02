import { test, expect } from "@playwright/test";
import proveedores from "./fixtures/proveedores.json" with { type: "json" };

/**
 * AL3-14 — 3 perfiles de proveedor (con/sin sanciones, con/sin
 * contrataciones). El endpoint /api/suppliers no filtra por RUC — la página
 * trae la lista completa y busca `supplierId === PE-RUC-<ruc>` client-side
 * (ver Proveedor.tsx), así que la fixture siempre expone la lista completa
 * de supplierRows y cada test verifica que solo aparezca la fila propia.
 */
const PROFILES = Object.values(proveedores);

async function mockSuppliers(page: import("@playwright/test").Page) {
  const resultados = PROFILES.map((p) => p.supplierRow).filter((r): r is NonNullable<typeof r> => r !== null);
  await page.route("**/compras-publicas/api/suppliers**", async (route) => {
    await route.fulfill({
      json: { resultados, concentracion: { cr3: 100, cr5: 100, hhi: 5000, proveedoresConsiderados: resultados.length } },
    });
  });
}

test("proveedor CON sanciones y CON contrataciones: identidad + sanción vigente + monto adjudicado", async ({ page }) => {
  const p = proveedores.conSancionesConContrataciones;
  await mockSuppliers(page);
  await page.route(`**/identidad-fiscal/api/contribuyentes/${p.ruc}`, (route) => route.fulfill({ json: p.identidad }));
  await page.route(`**/proveedores-sancionados/api/sanciones/${p.ruc}`, (route) => route.fulfill({ json: p.sanciones }));

  await page.goto(`/proveedor/${p.ruc}`);

  await expect(page.getByText(p.identidad.value.razonSocial).first()).toBeVisible();
  await expect(page.getByText(p.identidad.value.estado)).toBeVisible();
  await expect(page.getByText("Inhabilitación")).toBeVisible();
  await expect(page.getByText("VIGENTE")).toBeVisible();
  await expect(page.getByText(p.sanciones.items[0].expediente!, { exact: false })).toBeVisible();
  await expect(page.getByText(p.supplierRow!.valorTotal.toLocaleString("es-PE"))).toBeVisible();
});

test("proveedor SIN sanciones y CON contrataciones: sin sanciones + monto adjudicado visible", async ({ page }) => {
  const p = proveedores.sinSancionesConContrataciones;
  await mockSuppliers(page);
  await page.route(`**/identidad-fiscal/api/contribuyentes/${p.ruc}`, (route) => route.fulfill({ json: p.identidad }));
  await page.route(`**/proveedores-sancionados/api/sanciones/${p.ruc}`, (route) => route.fulfill({ json: p.sanciones }));

  await page.goto(`/proveedor/${p.ruc}`);

  await expect(page.getByText(p.identidad.value.razonSocial).first()).toBeVisible();
  await expect(page.getByText("No se registran sanciones en el periodo cubierto.")).toBeVisible();
  await expect(page.getByText(p.supplierRow!.valorTotal.toLocaleString("es-PE"))).toBeVisible();
});

test("proveedor SIN sanciones y SIN contrataciones: identidad visible, sección de contrataciones ausente", async ({ page }) => {
  const p = proveedores.sinSancionesSinContrataciones;
  await mockSuppliers(page);
  await page.route(`**/identidad-fiscal/api/contribuyentes/${p.ruc}`, (route) => route.fulfill({ json: p.identidad }));
  await page.route(`**/proveedores-sancionados/api/sanciones/${p.ruc}`, (route) => route.fulfill({ json: p.sanciones }));

  await page.goto(`/proveedor/${p.ruc}`);

  await expect(page.getByText(p.identidad.value.razonSocial).first()).toBeVisible();
  await expect(page.getByText("No se registran sanciones en el periodo cubierto.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contrataciones" })).toHaveCount(0);
});
