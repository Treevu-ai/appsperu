/**
 * Tests de los handlers MCP de las fuentes nuevas sin ruta Express
 * (`sunat_aduanas_comercio_bienes`, `bcrp_comercio_exterior_comtrade`,
 * `bcrp_comercio_exterior_wdi`).
 *
 * Patrón copiado de los tests de handlers cruzados del repo (`cruces-handler.test.ts`):
 * se mockea el pool de base; aquí ningún handler cruza bases, así que solo hace
 * falta `db`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { list as comercioList, meta as comercioMeta } from "../handlers/sunat-aduanas/comercio-bienes.js";
import { list as comtradeList } from "../handlers/bcrp-comercio-exterior/benchmark-externo.js";
import { list as wdiList, indicadores as wdiIndicadores } from "../handlers/bcrp-comercio-exterior/contexto-paises.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const dbQuery = vi.fn();

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
}

beforeEach(() => {
  dbQuery.mockReset();
});

describe("comercio-bienes:list", () => {
  it("devuelve filas agregadas en camelCase con unidad declarada", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          anio: 2024,
          flujo: "EXPORTACION",
          subpartida: "0801110000",
          descripcion: "COCO FRUTO",
          sector: "AGROPECUARIO",
          tipo: "TRADICIONAL",
          pais_codigo: "NL",
          pais_nombre: "PAISES BAJOS",
          continente: "EUROPA",
          bloque_1: "-",
          bloque_2: "-",
          cuode: "I. PRODUCTOS PRIMARIOS",
          via_codigo: "1",
          via_nombre: "MARITIMO",
          usd_millones: "12.5",
          tm: "1000",
          filas_origen: 12,
          fecha_corte: "20260512",
        },
      ],
    });

    const res = await comercioList(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.unidad).toBe("USD millones");
    expect(body.fuente).toContain("MINCETUR DGIECE");
    const primero = (body.resultados as Array<Record<string, unknown>>)[0];
    expect(primero.subpartida).toBe("0801110000");
    expect(primero.usdMillones).toBe(12.5);
    expect(primero.filasOrigen).toBe(12);
  });

  it("groupBy inválido devuelve 400 con los valores posibles", async () => {
    const res = await comercioList(ctx({ groupBy: "mes" }));
    expect(res.status).toBe(400);
    expect(String((res.body as { error: string }).error)).toContain("subpartida");
  });

  it("groupBy=pais agrupa y ordena por monto", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        { dimension: "NL", usd_millones: "100.5", tm: "10", subpartidas: "50", paises: "1" },
        { dimension: "US", usd_millones: "90.25", tm: "8", subpartidas: "40", paises: "1" },
      ],
    });
    const res = await comercioList(ctx({ groupBy: "pais", anio: 2024 }));
    expect(res.status).toBe(200);
    const body = res.body as { resultados: Array<{ valor: string; usdMillones: number }> };
    expect(body.resultados.map((r) => r.valor)).toEqual(["NL", "US"]);
    expect(body.resultados[0].usdMillones).toBe(100.5);
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("GROUP BY pais_codigo");
  });
});

describe("comercio-bienes:meta", () => {
  it("devuelve lotes y cobertura por año/flujo", async () => {
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "7", source_file: "mincetur_2024.xlsx", year: 2024, checksum: "abc", row_count: 631118, ingested_at: "2026-10-14T00:00:00Z" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "EXPORTACION", filas: "5000", corte: "20260512" },
        ],
      });
    const res = await comercioMeta(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as { lotes: unknown[]; cobertura: Array<{ filasAgregadas: number; fechaCorteFuente: string }> };
    expect(body.lotes).toHaveLength(1);
    expect(body.cobertura[0].filasAgregadas).toBe(5000);
    expect(body.cobertura[0].fechaCorteFuente).toBe("20260512");
  });
});

describe("benchmark-externo:list (Comtrade)", () => {
  it("devuelve filas mapeadas con unidad USD (no millones)", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL",
          fob_usd: "74053924515.753", cif_usd: null, primary_usd: "74053924515.753",
          es_estimado: true, es_agregado: true,
        },
      ],
    });
    const res = await comtradeList(ctx({ anio: 2024 }));
    expect(res.status).toBe(200);
    const body = res.body as { resultados: Array<{ partnerCode: string; fobUsd: number }>; unidad: string };
    expect(body.unidad).toBe("USD (unidades, no millones)");
    expect(body.resultados[0].partnerCode).toBe("0");
    expect(body.resultados[0].fobUsd).toBeCloseTo(74053924515.753, 3);
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toContain("WHERE reporter_code = $1");
  });

  it("modo=rca sin anio devuelve 400 (la RCA es contra el Mundo del mismo año)", async () => {
    const res = await comtradeList(ctx({ modo: "rca" }));
    expect(res.status).toBe(400);
  });

  it("modo=rca calcula la razón con el Mundo (reporter '0') como denominador", async () => {
    // Capítulo 08: Perú 5 de 100 (5%), Mundo 500 de 10000 (5%) -> RCA 1.
    // Capítulo 04: Perú 10 de 100 (10%), Mundo 100 de 10000 (1%) -> RCA 10.
    // OJO con los códigos: el país son sus filas con partner '0' (Mundo como
    // destino = total del país); el Mundo es reporter_code '0'. Partner '0' NO
    // es el valor mundial y partner = reporter no lo devuelve la API (2026-10-15).
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "10", cif_usd: null, primary_usd: "10", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "5", cif_usd: null, primary_usd: "5", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000", cif_usd: null, primary_usd: "10000", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "rca", anio: 2024, reporter: "604", flujo: "X" }));
    expect(res.status).toBe(200);
    const body = res.body as { modo: string; reporterTotalUsd: number; mundoTotalUsd: number; advertencias: string[]; resultados: Array<{ cmdCode: string; rca: number }> };
    expect(body.modo).toBe("rca");
    expect(body.reporterTotalUsd).toBe(100);
    expect(body.mundoTotalUsd).toBe(10000);
    expect(body.advertencias).toEqual([]);
    expect(body.resultados[0].cmdCode).toBe("04");
    expect(body.resultados[0].rca).toBeCloseTo(10, 6);
    expect(body.resultados[1].rca).toBeCloseTo(1, 6);
    // Ambas queries deben pedir país (partner '0') Y Mundo (reporter '0').
    for (const llamada of dbQuery.mock.calls) {
      expect(llamada[0] as string).toContain("partner_code = '0' AND reporter_code IN ($3, '0')");
    }
  });

  it("modo=rca sin filas del Mundo devuelve resultados vacíos y advierte", async () => {
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "5", cif_usd: null, primary_usd: "5", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "rca", anio: 2024 }));
    expect(res.status).toBe(200);
    const body = res.body as { resultados: unknown[]; advertencias: string[] };
    expect(body.resultados).toEqual([]);
    expect(body.advertencias).toHaveLength(1);
    expect(body.advertencias[0]).toContain("reporter '0'");
  });
});

describe("contexto-paises (WDI)", () => {
  it("list devuelve valores por país/indicador con nombre de la fuente", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          pais_codigo: "PE", pais_iso3: "PER", pais_nombre: "Peru",
          indicador_codigo: "NE.EXP.GNFS.ZS", indicador_nombre: "Exports of goods and services (% of GDP)",
          anio: 2024, valor: "28.8839339520309", fuente_actualizada: "2026-10-08",
        },
      ],
    });
    const res = await wdiList(ctx({ pais: "PER", indicador: "NE.EXP.GNFS.ZS" }));
    expect(res.status).toBe(200);
    const body = res.body as { resultados: Array<{ valor: number }>; fuenteUltimaActualizacion: string; fuente: string };
    expect(body.resultados[0].valor).toBeCloseTo(28.8839339520309, 9);
    expect(body.fuenteUltimaActualizacion).toBe("2026-10-08");
    expect(body.fuente).toContain("World Development Indicators");
  });

  it("indicadores lista el catálogo ingerido con su cobertura", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          indicador_codigo: "NY.GDP.MKTP.CD",
          indicador_nombre: "GDP (current US$)",
          paises: "15", anio_min: 2015, anio_max: 2024, valores: "140",
        },
      ],
    });
    const res = await wdiIndicadores(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as { indicadores: Array<{ codigo: string; paises: number; anioMax: number }> };
    expect(body.indicadores[0].codigo).toBe("NY.GDP.MKTP.CD");
    expect(body.indicadores[0].paises).toBe(15);
    expect(body.indicadores[0].anioMax).toBe(2024);
  });
});
