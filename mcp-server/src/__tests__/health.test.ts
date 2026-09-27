import { describe, expect, it, vi, beforeEach } from "vitest";

const callApiMock = vi.fn();
vi.mock("../http-client.js", () => ({
  callApi: (...args: unknown[]) => callApiMock(...args),
  McpHttpError: class McpHttpError extends Error {},
}));

import { runHealthCheck } from "../tools/health.js";
import { APP_KEYS, baseUrlFor } from "../apps.js";
import { TOOL_CATALOG } from "../catalog.js";

/** URL de /health tal como la arma `checkApp` para esa app. */
function healthUrl(app: (typeof APP_KEYS)[number]): string {
  return `${baseUrlFor(app).replace(/\/+$/, "")}/health`;
}

/** Por defecto todas responden 200; cada test declara sus excepciones. */
function todasSalen(excepciones: Record<string, () => Promise<{ status: number }>> = {}) {
  callApiMock.mockImplementation(async (url: string) => {
    const excepcion = Object.entries(excepciones).find(([app]) => healthUrl(app as (typeof APP_KEYS)[number]) === url);
    if (excepcion) return excepcion[1]();
    return { status: 200 };
  });
}

describe("runHealthCheck", () => {
  beforeEach(() => callApiMock.mockReset());

  it("revisa todas las apps del catálogo cuando no se pasa ninguna", async () => {
    todasSalen();
    const report = await runHealthCheck();

    expect(report.resumen.appsTotales).toBe(APP_KEYS.length);
    expect(report.resumen.appsOk).toBe(APP_KEYS.length);
    expect(report.resumen.appsCaidas).toBe(0);
    expect(report.catalogo).toEqual({ tools: TOOL_CATALOG.length, apps: APP_KEYS.length });
  });

  it("marca caída la app que no conecta y descuenta sus tools del total operativo", async () => {
    const caida = "infobras";
    const toolsInfobras = TOOL_CATALOG.filter((t) => t.app === caida).length;
    todasSalen({
      [caida]: async () => {
        throw new Error("No se pudo conectar.");
      },
    });

    const report = await runHealthCheck();

    const fila = report.apps.find((a) => a.app === caida);
    expect(fila?.ok).toBe(false);
    expect(fila?.status).toBeNull();
    expect(fila?.error).toMatch(/No se pudo conectar/);
    expect(report.resumen.appsCaidas).toBe(1);
    expect(report.resumen.toolsSinBackend).toBe(toolsInfobras);
    expect(report.resumen.toolsOperativos).toBe(TOOL_CATALOG.length - toolsInfobras);
  });

  it("cuenta como caída un /health que responde algo distinto de 200", async () => {
    const trasProxy = "ceplan-geo";
    todasSalen({ [trasProxy]: async () => ({ status: 502 }) });

    const report = await runHealthCheck();
    const fila = report.apps.find((a) => a.app === trasProxy);

    expect(fila?.ok).toBe(false);
    expect(fila?.status).toBe(502);
    // El status se conserva en el error: "no conecta" y "un proxy contesta por
    // la app" son diagnósticos distintos y no conviene reportarlos igual.
    expect(fila?.error).toMatch(/502/);
  });

  it("filtra a una sola app cuando se pasa `app`", async () => {
    todasSalen();
    const report = await runHealthCheck("mimp");

    expect(report.resumen.appsTotales).toBe(1);
    expect(report.apps).toHaveLength(1);
    expect(report.apps[0]?.app).toBe("mimp");
  });

  it("ordena las apps caídas primero para que el diagnóstico empiece por lo que broke", async () => {
    todasSalen({
      infobras: async () => {
        throw new Error("down");
      },
      mimp: async () => {
        throw new Error("down");
      },
    });

    const report = await runHealthCheck();
    const primeraCaida = report.apps.findIndex((a) => !a.ok);
    const ultimaSana = report.apps.map((a) => a.ok).lastIndexOf(true);

    expect(primeraCaida).toBeGreaterThanOrEqual(0);
    expect(primeraCaida).toBeLessThan(ultimaSana);
  });

  it("los tools operativos más los sin backend cuadran con el catálogo completo", async () => {
    todasSalen({
      radar_ejecucion: async () => {
        throw new Error("down");
      },
    });

    const report = await runHealthCheck();
    expect(report.resumen.toolsOperativos + report.resumen.toolsSinBackend).toBe(TOOL_CATALOG.length);
  });
});
