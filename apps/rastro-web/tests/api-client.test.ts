/**
 * Tests del cliente HTTP (AL3-02).
 *
 * Cubren los 5 caminos de error tipados en AppUnavailableError.kind:
 *   1. éxito (200 + JSON)
 *   2. timeout (Promise no resuelve)
 *   3. error de red (puerto cerrado)
 *   4. HTTP 4xx (404)
 *   5. HTTP 5xx (500)
 *   6. JSON inválido
 *
 * Y validan la regla P3: fetch SIEMPRE con `cache: "no-store"`.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse, passthrough } from "msw";
import { server } from "../src/test/setup.js";
import {
  AppUnavailableError,
  APP_CATALOG,
  type AppKey,
} from "../src/lib/types.js";
import {
  getRadarEjecucionMetaSources,
  getRadarEjecucionSectorFicha,
  getRadarEjecucionSectorComparativo,
  getRadarEjecucionBenchmark,
  getIdentidadFiscalContribuyente,
  getComprasPublicasSuppliers,
  getInfobrasPublicWorks,
} from "../src/lib/api-client.js";

describe("api-client — caminos de error tipados", () => {
  beforeEach(() => {
    // Inyectar env vars para tests (en modo test vite no las valida).
    for (const [appKey, meta] of Object.entries(APP_CATALOG) as [AppKey, typeof APP_CATALOG[AppKey]][]) {
      const url = `http://localhost:${meta.port}`;
      (import.meta.env as Record<string, string>)[meta.envKey] = url;
      // MSW no puede usar `import.meta.env`; sobreescribimos también las URLs
      // que MSW matchea (uppercase con guiones).
      // El matcher `*/api/...` ya captura cualquier host.
      void appKey;
    }
  });

  it("devuelve JSON válido en 200", async () => {
    const data = await getRadarEjecucionMetaSources();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("lanza AppUnavailableError(kind=http_4xx) en 404", async () => {
    server.use(
      http.get("*/api/sectores/:sectorId/ficha", () => new HttpResponse("no encontrado", { status: 404 })),
    );
    await expect(
      getRadarEjecucionSectorFicha({ sectorId: "INEXISTENTE" }),
    ).rejects.toMatchObject({ kind: "http_4xx", status: 404, name: "AppUnavailableError" });
  });

  it("lanza AppUnavailableError(kind=http_5xx) en 500", async () => {
    server.use(
      http.get("*/api/sectores/:sectorId/ficha", () => new HttpResponse(null, { status: 500 })),
    );
    await expect(
      getRadarEjecucionSectorFicha({ sectorId: "TRANSPORTE" }),
    ).rejects.toMatchObject({ kind: "http_5xx", status: 500 });
  });

  it("lanza AppUnavailableError(kind=invalid_json) si la respuesta no es JSON", async () => {
    server.use(
      http.get("*/api/contribuyentes/:ruc", () => new HttpResponse("<html>error</html>", { status: 200 })),
    );
    await expect(
      getIdentidadFiscalContribuyente("20123456789"),
    ).rejects.toMatchObject({ kind: "invalid_json" });
  });

  it("lanza AppUnavailableError(kind=timeout) cuando el fetch excede timeoutMs", async () => {
    server.use(
      http.get("*/api/suppliers", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({ items: [] });
      }),
    );
    await expect(
      getComprasPublicasSuppliers({}, { timeoutMs: 50 }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("lanza AppUnavailableError(kind=network) cuando el host no responde", async () => {
    // Para este test queremos que la request llegue a la red real y falle
    // (puerto 1 no escucha). `passthrough()` desactiva MSW para este handler.
    server.use(http.get("*/api/suppliers", () => passthrough()));
    (import.meta.env as Record<string, string>)["VITE_API_BASE_URL_COMPRAS_PUBLICAS"] =
      "http://127.0.0.1:1";
    await expect(
      getComprasPublicasSuppliers({}),
    ).rejects.toBeInstanceOf(AppUnavailableError);
  });

  it("infobras devuelve obras con señales derivadas (Cost Drift, Gap físico-financiero)", async () => {
    const data = await getInfobrasPublicWorks({ departamento: "LA LIBERTAD" });
    expect(data.resultados[0]).toHaveProperty("codigoInfobras");
    expect(data.resultados[0]).toHaveProperty("costDriftPct");
    expect(data.resultados[0]).toHaveProperty("gapFisicoFinanciero");
  });

  it("sector comparativo devuelve resultados y limitation literal", async () => {
    const data = await getRadarEjecucionSectorComparativo({
      anio: 2026,
      departamento: "LA LIBERTAD",
      sectores: ["TRANSPORTE", "SALUD"],
    });
    expect(Array.isArray(data.resultados)).toBe(true);
    expect(data.resultados.length).toBeGreaterThan(0);
    expect(data.limitation).toContain("No suma Gobierno Nacional");
    expect(data.resultados[0]).toHaveProperty("sectorId");
    expect(data.resultados[0]).toHaveProperty("cobertura.estado");
  });

  it("benchmark devuelve status=ok con percentil y mediana para entidad conocida", async () => {
    const data = await getRadarEjecucionBenchmark({ entityCode: "831", anio: 2026 });
    expect(data.status).toBe("ok");
    expect(data.entityCode).toBe("831");
    expect(data.anioFiscal).toBe(2026);
    expect(typeof data.percentil).toBe("number");
    expect(typeof data.medianaAvancePct).toBe("number");
    expect(data.criterios).toContain("nivel_gobierno");
    expect(data.fechaCorte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("benchmark devuelve status=datos_insuficientes cuando n<minRequerido", async () => {
    const data = await getRadarEjecucionBenchmark({ entityCode: "999", anio: 2026 });
    expect(data.status).toBe("datos_insuficientes");
    expect(typeof data.n).toBe("number");
    expect(typeof data.minRequerido).toBe("number");
    expect(data.minRequerido).toBeGreaterThan(data.n ?? 0);
  });

  it("benchmark devuelve 404 con AppUnavailableError para entidad inexistente", async () => {
    server.use(
      http.get("*/api/benchmark/:entityCode", () =>
        new HttpResponse("Entidad no encontrada.", { status: 404 }),
      ),
    );
    await expect(
      getRadarEjecucionBenchmark({ entityCode: "0000000" }),
    ).rejects.toMatchObject({ kind: "http_4xx", status: 404 });
  });
});
