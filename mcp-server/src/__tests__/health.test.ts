import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * El health check abre un `Client` de @neondatabase/serverless por app. La
 * connection string lleva el nombre de la base en el path, así que el mock
 * decide el comportamiento según ese path: es lo que le permite al test
 * simular "esta app no tiene base" frente a "esta base está caída".
 */
const basesSinRespuesta = new Set<string>();
const basesCaidas = new Set<string>();
const consultas: { base: string; sql: string }[] = [];
let enVuelo = 0;
let maximoSimultaneo = 0;

vi.mock("@neondatabase/serverless", () => ({
  Client: class {
    private connectionString: string;
    constructor(connectionString: string) {
      this.connectionString = connectionString;
    }
    private get base(): string {
      return new URL(this.connectionString).pathname.replace(/^\//, "");
    }
    async connect(): Promise<void> {}
    async end(): Promise<void> {}
    async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
      const base = this.base;
      consultas.push({ base, sql });
      enVuelo++;
      maximoSimultaneo = Math.max(maximoSimultaneo, enVuelo);
      try {
        // Cede el event loop para que las conexiones concurrentes se solapen
        // de verdad; si el mock fuera síncrono, el contador siempre marcaría 1.
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (basesCaidas.has(base)) throw new Error("conexión fallida");
        if (basesSinRespuesta.has(base)) return { rows: [], rowCount: 0 };
        return { rows: [{ alive: 1 }], rowCount: 1 };
      } finally {
        enVuelo--;
      }
    }
  },
}));

import { runHealthCheck, DEFERRED_APPS } from "../tools/health.js";
import { APP_KEYS } from "../apps.js";
import { databaseNameFor } from "../db/neon-env.js";
import { TOOL_CATALOG } from "../catalog.js";

const envConSecreto = { NEON_DATABASE_URL: "postgresql://u:p@ep-test.aws.neon.tech/postgres" };

describe("runHealthCheck (Neon)", () => {
  beforeEach(() => {
    basesSinRespuesta.clear();
    basesCaidas.clear();
    consultas.length = 0;
    enVuelo = 0;
    maximoSimultaneo = 0;
  });

  it("marca sin_base cuando no hay env (modo stdio, sin secret)", async () => {
    const report = await runHealthCheck(undefined, undefined);

    expect(report.resumen.ok).toBe(0);
    expect(report.resumen.caidas).toBe(0);
    expect(report.resumen.sinBase + report.resumen.diferidas).toBe(APP_KEYS.length);
    expect(report.resumen.toolsOperativos).toBe(0);
    expect(report.resumen.toolsSinBackend).toBe(TOOL_CATALOG.length);
  });

  it("marca caida cuando el secret no está configurado en el Worker", async () => {
    const report = await runHealthCheck("infobras", {});

    expect(report.apps).toHaveLength(1);
    expect(report.apps[0].status).toBe("sin_base");
    expect(report.apps[0].error).toMatch(/NEON_DATABASE_URL/);
  });

  it("marca ok la app cuya base responde SELECT 1", async () => {
    const report = await runHealthCheck("infobras", envConSecreto);

    expect(report.resumen.ok).toBe(1);
    expect(report.apps[0].status).toBe("ok");
    expect(report.apps[0].base).toBe("infobras");
    expect(consultas[0]?.base).toBe("infobras");
    expect(consultas[0]?.sql).toMatch(/SELECT 1/);
  });

  it("distingue base caída de base vacía", async () => {
    basesCaidas.add("infobras");
    basesSinRespuesta.add("mimp");

    const caida = await runHealthCheck("infobras", envConSecreto);
    const vacia = await runHealthCheck("mimp", envConSecreto);

    expect(caida.apps[0].status).toBe("caida");
    expect(caida.apps[0].error).toMatch(/conexión fallida/);
    expect(vacia.apps[0].status).toBe("sin_base");
  });

  it("filtra a una sola app cuando se pasa `app`", async () => {
    const report = await runHealthCheck("mimp", envConSecreto);

    expect(report.apps).toHaveLength(1);
    expect(report.apps[0].app).toBe("mimp");
  });

  it("reporta como diferidas las apps de PostGIS pospuestas a la segunda fase", async () => {
    const report = await runHealthCheck(undefined, envConSecreto);

    for (const app of DEFERRED_APPS) {
      const fila = report.apps.find((a) => a.app === app);
      expect(fila?.status).toBe("diferida");
      expect(fila?.error).toMatch(/PostGIS/);
    }
    expect(report.resumen.diferidas).toBe(DEFERRED_APPS.length);
  });

  it("ordena caídas y sin base antes que las sanas, para que el diagnóstico empiece por lo que broke", async () => {
    const todas = APP_KEYS.filter((a) => !DEFERRED_APPS.includes(a));
    basesCaidas.add(databaseNameFor(todas[2]));
    basesSinRespuesta.add(databaseNameFor(todas[0]));

    const report = await runHealthCheck(undefined, envConSecreto);
    const estados = report.apps.map((a) => a.status);
    const ultimaSana = estados.lastIndexOf("ok");
    const primeraSana = estados.indexOf("ok");

    expect(primeraSana).toBeGreaterThan(0);
    expect(ultimaSana).toBe(estados.length - 1);
    // Una base caída es peor noticia que una nunca provisionada, y ambas van
    // antes que la postergada a propósito, que es un estado conocido.
    expect(estados[0]).toBe("caida");
    expect(estados[1]).toBe("sin_base");
    expect(estados.indexOf("diferida")).toBeLessThan(primeraSana);
  });

  it("los tools operativos más los sin backend cuadran con el catálogo completo", async () => {
    basesCaidas.add(databaseNameFor(APP_KEYS[0]));

    const report = await runHealthCheck(undefined, envConSecreto);

    expect(report.resumen.toolsOperativos + report.resumen.toolsSinBackend).toBe(TOOL_CATALOG.length);
  });

  it("no abre más de 4 conexiones a la vez, por debajo del tope de 6 de Workers", async () => {
    enVuelo = 0;
    maximoSimultaneo = 0;

    await runHealthCheck(undefined, envConSecreto);

    expect(maximoSimultaneo).toBeGreaterThan(1);
    expect(maximoSimultaneo).toBeLessThanOrEqual(4);
  });
});
