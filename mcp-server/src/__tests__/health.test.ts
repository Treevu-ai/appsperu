import { describe, expect, it, vi, beforeEach } from "vitest";

const mockD1Prepare = vi.fn();
const mockD1First = vi.fn();

function makeMockD1DB() {
  return {
    prepare: mockD1Prepare.mockReturnValue({ first: mockD1First }),
  };
}

const mockEnv: Record<string, unknown> = {};

function setupEnv(appsOk: Set<string>, appsFallidas: Set<string>) {
  mockEnv.MCP_DB = makeMockD1DB();
  for (const app of appsFallidas) {
    mockEnv[`DB_${app.toUpperCase().replace(/-/g, "_").replace(/"/g, "")}`] = {
      prepare: () => ({ first: () => Promise.reject(new Error("conexión fallida")) }),
    };
  }
  for (const app of appsOk) {
    const binding = `DB_${app.toUpperCase().replace(/-/g, "_").replace(/"/g, "")}`;
    if (!mockEnv[binding]) {
      mockEnv[binding] = {
        prepare: mockD1Prepare.mockReturnValue({ first: mockD1First }),
      };
    }
  }
}

import { runHealthCheck } from "../tools/health.js";
import { APP_KEYS } from "../apps.js";
import { TOOL_CATALOG } from "../catalog.js";

describe("runHealthCheck (D1)", () => {
  beforeEach(() => {
    mockD1Prepare.mockClear();
    mockD1First.mockClear();
    Object.keys(mockEnv).forEach((k) => delete mockEnv[k]);
  });

  it("marca caída cuando no hay env (modo stdio sin bindings D1)", async () => {
    const report = await runHealthCheck(undefined, undefined);

    const appsFromCatalog = [...new Set(TOOL_CATALOG.map((t) => t.app))];
    expect(report.resumen.appsTotales).toBe(appsFromCatalog.length);
    expect(report.resumen.appsOk).toBe(0);
    expect(report.resumen.appsCaidas).toBe(appsFromCatalog.length);
    expect(report.resumen.toolsOperativos).toBe(0);
    expect(report.resumen.toolsSinBackend).toBe(TOOL_CATALOG.length);
  });

  it("marca caída la app cuyo binding D1 no existe en env", async () => {
    mockEnv.MCP_DB = makeMockD1DB();

    const report = await runHealthCheck("infobras" as (typeof APP_KEYS)[number], mockEnv);

    expect(report.resumen.appsTotales).toBe(1);
    expect(report.resumen.appsOk).toBe(0);
    const fila = report.apps[0];
    expect(fila.ok).toBe(false);
    expect(fila.error).toMatch(/Binding D1/);
  });

  it("marca OK la app cuyo binding D1 responde SELECT 1", async () => {
    const catalogApps = [...new Set(TOOL_CATALOG.map((t) => t.app))];
    setupEnv(new Set(catalogApps), new Set());
    mockD1First.mockResolvedValue({ alive: 1 });

    const report = await runHealthCheck("infobras" as (typeof APP_KEYS)[number], mockEnv);

    expect(report.resumen.appsOk).toBe(1);
    expect(report.apps[0].ok).toBe(true);
  });

  it("filtra a una sola app cuando se pasa `app`", async () => {
    const catalogApps = [...new Set(TOOL_CATALOG.map((t) => t.app))];
    setupEnv(new Set(catalogApps), new Set());
    mockD1First.mockResolvedValue({ alive: 1 });

    const report = await runHealthCheck("mimp" as (typeof APP_KEYS)[number], mockEnv);
    expect(report.resumen.appsTotales).toBe(1);
    expect(report.apps).toHaveLength(1);
    expect(report.apps[0]?.app).toBe("mimp");
  });

  it("ordena las apps caídas primero para que el diagnóstico empiece por lo que broke", async () => {
    const allApps = [...new Set(TOOL_CATALOG.map((t) => t.app))] as (typeof APP_KEYS)[number][];
    const okApps = new Set(allApps.slice(0, 5));
    const failApps = new Set(allApps.slice(5, 7));
    setupEnv(okApps, failApps);
    mockD1First.mockResolvedValue({ alive: 1 });

    const report = await runHealthCheck(undefined, mockEnv);
    const primeraCaida = report.apps.findIndex((a) => !a.ok);
    const ultimaSana = report.apps.map((a) => a.ok).lastIndexOf(true);

    expect(primeraCaida).toBeGreaterThanOrEqual(0);
    expect(primeraCaida).toBeLessThan(ultimaSana);
  });

  it("los tools operativos más los sin backend cuadran con el catálogo completo", async () => {
    const allApps = [...new Set(TOOL_CATALOG.map((t) => t.app))] as (typeof APP_KEYS)[number][];
    const okApps = new Set(allApps);
    const failApps = new Set<(typeof APP_KEYS)[number]>([allApps[0]]);
    okApps.delete(allApps[0]);

    setupEnv(okApps, failApps);
    mockD1First.mockResolvedValue({ alive: 1 });

    const report = await runHealthCheck(undefined, mockEnv);
    expect(report.resumen.toolsOperativos + report.resumen.toolsSinBackend).toBe(TOOL_CATALOG.length);
  });
});
