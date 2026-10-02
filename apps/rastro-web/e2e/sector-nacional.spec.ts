import { test, expect } from "@playwright/test";
import fixture from "./fixtures/sector-nacional.json" with { type: "json" };

/**
 * GORE-05b/GORE-07a — ficha de sector en ámbito NACIONAL (`/sector/:id`),
 * hermana de `/gore/la-libertad/ficha` (estrictamente regional). Verifica
 * que el pedido real incluye `ambito=NACIONAL` sin `departamento`, y que la
 * UI declara la cobertura como "NO_VERIFICADA" en vez de reusar el badge
 * "BLOQUEADA" (rojo) que produciría `aggregateSectorBudget` para el caso
 * regional — ver `Sector.tsx` y su comentario sobre esta decisión.
 */
test("ficha nacional de sector: ambito=NACIONAL sin departamento, cobertura NO_VERIFICADA declarada", async ({
  page,
}) => {
  let requestedUrl: URL | null = null;
  const fulfillFicha = async (route: import("@playwright/test").Route) => {
    requestedUrl = new URL(route.request().url());
    await route.fulfill({ json: fixture });
  };
  // Producción / CI: base https://api.example.test/radar-ejecucion → …/radar-ejecucion/api/…
  await page.route("**/radar-ejecucion/api/sectores/**/ficha**", fulfillFicha);
  // Dev local (.env): base http://localhost:4000 → …/api/sectores/… (sin prefijo de app)
  await page.route("**/api/sectores/**/ficha**", fulfillFicha);

  await page.goto(`/sector/${fixture.sector.id}?anio=2026`);

  await expect(page.getByRole("heading", { name: fixture.sector.id, exact: true })).toBeVisible();
  await expect(page.getByText("Ámbito nacional")).toBeVisible();

  // El request real pidió ambito=NACIONAL y NO mandó departamento (PV-01/GORE-05a).
  expect(requestedUrl).not.toBeNull();
  expect(requestedUrl!.searchParams.get("ambito")).toBe("NACIONAL");
  expect(requestedUrl!.searchParams.has("departamento")).toBe(false);

  // Cobertura declarada literalmente, sin badge rojo "BLOQUEADA".
  await expect(page.getByText("NO_VERIFICADA", { exact: true })).toBeVisible();
  await expect(page.getByText(/agregado nacional, sin corte de cobertura por/)).toBeVisible();
  await expect(page.getByText("BLOQUEADA", { exact: true })).not.toBeVisible();

  const meta = fixture.entidades.find((e) => e.reglaTerritorial === "META_DEPARTAMENTO")!;
  const sede = fixture.entidades.find((e) => e.reglaTerritorial === "SEDE_EJECUTORA")!;
  await expect(page.getByText("Gasto nacional (regla META_DEPARTAMENTO)")).toBeVisible();
  await expect(page.getByText(meta.pia.toLocaleString("es-PE"))).toBeVisible();
  await expect(page.getByText(meta.pim.toLocaleString("es-PE"))).toBeVisible();
  await expect(page.getByText(meta.devengado.toLocaleString("es-PE"))).toBeVisible();
  await expect(page.getByText("Ejecución nacional (regla SEDE_EJECUTORA)")).toBeVisible();
  await expect(page.getByText(sede.pia.toLocaleString("es-PE"))).toBeVisible();

  await expect(page.getByText(fixture.limitation).first()).toBeVisible();
});
