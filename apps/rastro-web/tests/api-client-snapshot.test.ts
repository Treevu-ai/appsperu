/**
 * Cubre el fallback al snapshot semanal ("corte") en requestJson() cuando
 * las APIs no están publicadas — ver docs del plan "corte semanal
 * explícito". Archivo separado de api-client.test.ts porque mockea
 * apisPublishedForBrowser() y el propio snapshot.json a nivel de módulo,
 * lo que interferiría con las pruebas de esa suite (que asumen "publicado").
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api-config.js", () => ({
  apisPublishedForBrowser: () => false,
}));

vi.mock("../src/data/snapshot.json", () => ({
  default: {
    corte: "2026-09-09T13:00:00.000Z",
    entries: {
      "radar-ejecucion:/api/sectores/TRANSPORTE/ficha?anio=2026&departamento=LA LIBERTAD": {
        value: { pia: 1, pim: 2, devengado: 3 },
        fuente: "radar-ejecucion / radar_ejecucion_sector_ficha",
        corte: "2026-09-09",
        cobertura: "COMPLETA",
      },
    },
  },
}));

const { getRadarEjecucionSectorFicha, getRadarEjecucionBenchmark } = await import("../src/lib/api-client.js");
const { AppUnavailableError } = await import("../src/lib/types.js");

describe("api-client — fallback al snapshot semanal cuando no hay APIs publicadas", () => {
  it("devuelve el body del snapshot cuando la consulta calza con una entrada", async () => {
    const data = await getRadarEjecucionSectorFicha({
      sectorId: "TRANSPORTE",
      anio: 2026,
      departamento: "LA LIBERTAD",
    });
    expect(data).toMatchObject({ value: { pia: 1, pim: 2, devengado: 3 }, cobertura: "COMPLETA" });
  });

  it("lanza AppUnavailableError(kind=snapshot_miss) cuando la consulta no está en el snapshot", async () => {
    await expect(getRadarEjecucionBenchmark({ entityCode: "831", anio: 2026 })).rejects.toMatchObject({
      kind: "snapshot_miss",
      name: "AppUnavailableError",
    });
    await expect(getRadarEjecucionBenchmark({ entityCode: "831", anio: 2026 })).rejects.toBeInstanceOf(
      AppUnavailableError,
    );
  });
});
