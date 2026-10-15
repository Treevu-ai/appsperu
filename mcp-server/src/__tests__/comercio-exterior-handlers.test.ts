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

  it("modo=rca-serie arma la serie por capítulo y clasifica la tendencia", async () => {
    // Cap04: RCA 2023 = (10/100)/(100/10000) = 10; 2024 = (30/200)/(100/10000) = 15 → alza.
    // Cap08: RCA 2023 = (5/100)/(500/10000) = 1; 2024 = (10/200)/(500/10000) = 1 → estable.
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2023, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "10", cif_usd: null, primary_usd: "10", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "30", cif_usd: null, primary_usd: "30", es_estimado: false, es_agregado: true },
          { anio: 2023, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2023, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "5", cif_usd: null, primary_usd: "5", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "10", cif_usd: null, primary_usd: "10", es_estimado: false, es_agregado: true },
          { anio: 2023, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2023, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "200", cif_usd: null, primary_usd: "200", es_estimado: true, es_agregado: true },
          { anio: 2023, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000", cif_usd: null, primary_usd: "10000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000", cif_usd: null, primary_usd: "10000", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "rca-serie", reporter: "604", flujo: "X" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      anios: number[];
      advertencias: string[];
      resultados: Array<{ cmdCode: string; rcaInicio: number; rcaFin: number; delta: number; tendencia: string; serie: Array<{ anio: number; rca: number }> }>;
    };
    expect(body.anios).toEqual([2023, 2024]);
    expect(body.advertencias).toEqual([]);
    expect(body.resultados[0].cmdCode).toBe("04");
    const cap04 = body.resultados[0];
    expect(cap04.rcaInicio).toBeCloseTo(10, 6);
    expect(cap04.rcaFin).toBeCloseTo(15, 6);
    expect(cap04.delta).toBeCloseTo(5, 6);
    expect(cap04.tendencia).toBe("alza");
    expect(cap04.serie.map((p) => p.anio)).toEqual([2023, 2024]);
    const cap08 = body.resultados.find((r) => r.cmdCode === "08")!;
    expect(cap08.rcaFin).toBeCloseTo(1, 6);
    expect(cap08.tendencia).toBe("estable");
    // El país y el Mundo salen de la misma consulta (reporter IN ($2, '0')).
    for (const llamada of dbQuery.mock.calls) {
      expect(llamada[0] as string).toContain("reporter_code IN ($2, '0')");
    }
  });

  it("modo=oportunidad cruza RCA < 1 con demanda mundial creciente (CAGR de importaciones)", async () => {
    // anioRca = 2024 (último con TOTAL X del país). Mundo M: 2023 → 2024.
    // Cap 26: RCA = (5/200)/(500/10000) = 0.5 < 1; mundo M 100 → 110 = +10% → oportunidad.
    // Cap 02: RCA = (10/200)/(100/10000) = 5 → excluido (ya fuerte).
    // Cap 08: RCA = (50/200)/(500/10000) = 5 → excluido (ya fuerte).
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2023, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "26", fob_usd: null, cif_usd: "100", primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "26", fob_usd: null, cif_usd: "110", primary_usd: "110", es_estimado: false, es_agregado: true },
          { anio: 2023, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "02", fob_usd: null, cif_usd: "100", primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "02", fob_usd: null, cif_usd: "95", primary_usd: "95", es_estimado: false, es_agregado: true },
          { anio: 2023, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "100", primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "120", primary_usd: "120", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "26", fob_usd: "5", cif_usd: null, primary_usd: "5", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "26", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "02", fob_usd: "10", cif_usd: null, primary_usd: "10", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "02", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "50", cif_usd: null, primary_usd: "50", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "200", cif_usd: null, primary_usd: "200", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000", cif_usd: null, primary_usd: "10000", es_estimado: true, es_agregado: true },
          { anio: 2023, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "40000", primary_usd: "40000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "43000", primary_usd: "43000", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "oportunidad" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      anioRca: number;
      umbralRca: number;
      advertencias: string[];
      resultados: Array<{ cmdCode: string; rca: number; crecimientoMundoM: number; participacionPeruMundo: number }>;
    };
    expect(body.anioRca).toBe(2024);
    expect(body.umbralRca).toBe(1);
    expect(body.advertencias).toEqual([]);
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0].cmdCode).toBe("26");
    expect(body.resultados[0].rca).toBeCloseTo(0.5, 6);
    expect(body.resultados[0].crecimientoMundoM).toBeCloseTo(0.1, 6);
    expect(body.resultados[0].participacionPeruMundo).toBeCloseTo(5 / 110, 9);
    expect(dbQuery.mock.calls[0][0] as string).toContain("flujo IN ('X', 'M')");
  });

  it("modo=rca-bilateral exige anio y socio válidos", async () => {
    expect((await comtradeList(ctx({ modo: "rca-bilateral", socio: "156" }))).status).toBe(400);
    expect((await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024 }))).status).toBe(400);
    expect((await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "0" }))).status).toBe(400);
    expect((await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "604", reporter: "604" }))).status).toBe(400);
    expect((await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "156", fobMin: -1 }))).status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("modo=rca-bilateral usa la importación del socio como demanda del mercado destino", async () => {
    // Cap 04: Perú→China 20, China importa 200 (de un mundo de 2000); Perú exporta
    // 10 de un país de 100; mundo exporta 100 de un mundo de 10000.
    // rcaBilateral = (20/200)/(10/2000) = 20; participación = 20/200 = 0.1;
    // especialización = (20/100)/(100/10000) = 20; RCA clásica = (10/100)/(100/10000) = 10.
    // Cap 08: (5/1000)/(5/5000) = 5.
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
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "200", primary_usd: "200", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "1000", primary_usd: "1000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "2000", primary_usd: "2000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "5000", primary_usd: "5000", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "400", primary_usd: "400", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "100000", primary_usd: "100000", es_estimado: true, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "04", fob_usd: "20", cif_usd: null, primary_usd: "20", es_estimado: false, es_agregado: false },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "08", fob_usd: "5", cif_usd: null, primary_usd: "5", es_estimado: false, es_agregado: false },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "TOTAL", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "156", fobMin: 0 }));
    expect(res.status).toBe(200);
    const body = res.body as {
      socio: string;
      advertencias: string[];
      resultados: Array<{ cmdCode: string; rcaBilateral: number; especializacionBilateral: number; rca: number; participacionMercado: number }>;
    };
    expect(body.socio).toBe("156");
    expect(body.advertencias).toEqual([]);
    expect(body.resultados[0].cmdCode).toBe("04");
    expect(body.resultados[0].rcaBilateral).toBeCloseTo(20, 6);
    expect(body.resultados[0].especializacionBilateral).toBeCloseTo(20, 6);
    expect(body.resultados[0].rca).toBeCloseTo(10, 6);
    expect(body.resultados[0].participacionMercado).toBeCloseTo(0.1, 6);
    expect(body.resultados[1].rcaBilateral).toBeCloseTo(5, 6);
    // La consulta de exportaciones país→socio filtra partner_code = $3 (el socio).
    expect(dbQuery.mock.calls[4][0] as string).toContain("reporter_code = $2 AND partner_code = $3");
  });

  it("modo=rca-bilateral aplica fobMin por defecto (US$1M) y advierte los omitidos", async () => {
    // Cap 08 queda bajo el umbral en ambos flujos (500 de bilateral, 800k de
    // demanda del socio); cap 04 supera US$1M en bilateral y demanda.
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "2000000", cif_usd: null, primary_usd: "2000000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100000000", cif_usd: null, primary_usd: "100000000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500000000", cif_usd: null, primary_usd: "500000000", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100000000", cif_usd: null, primary_usd: "100000000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000000000", cif_usd: null, primary_usd: "10000000000", es_estimado: true, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "5000000", primary_usd: "5000000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "800000", primary_usd: "800000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "2000000000", primary_usd: "2000000000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "5000000000", primary_usd: "5000000000", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "156", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "400000000", primary_usd: "400000000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "100000000000", primary_usd: "100000000000", es_estimado: true, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "04", fob_usd: "2000000", cif_usd: null, primary_usd: "2000000", es_estimado: false, es_agregado: false },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "08", fob_usd: "500", cif_usd: null, primary_usd: "500", es_estimado: false, es_agregado: false },
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "156", cmd_code: "TOTAL", fob_usd: "2000500", cif_usd: null, primary_usd: "2000500", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "156" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      fobMin: number;
      advertencias: string[];
      resultados: Array<{ cmdCode: string }>;
    };
    expect(body.fobMin).toBe(1_000_000);
    expect(body.resultados.map((r) => r.cmdCode)).toEqual(["04"]);
    expect(body.advertencias.some((a) => a.includes("1 capítulos con FOB menor a US$1,000,000"))).toBe(true);
    expect(body.advertencias.some((a) => a.includes("fobMin=0"))).toBe(true);
  });

  it("modo=rca-bilateral advierte cuando el socio no está ingerido", async () => {
    dbQuery
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "10", cif_usd: null, primary_usd: "10", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100", cif_usd: null, primary_usd: "100", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000", cif_usd: null, primary_usd: "10000", es_estimado: true, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "2000", primary_usd: "2000", es_estimado: false, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "100000", primary_usd: "100000", es_estimado: true, es_agregado: true },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await comtradeList(ctx({ modo: "rca-bilateral", anio: 2024, socio: "156" }));
    expect(res.status).toBe(200);
    const body = res.body as { resultados: unknown[]; advertencias: string[] };
    expect(body.resultados).toEqual([]);
    expect(body.advertencias.some((a) => a.includes("Sin exportaciones del reporter 604 hacia el socio 156"))).toBe(true);
    expect(body.advertencias.some((a) => a.includes("Sin importaciones del socio 156"))).toBe(true);
  });

  it("modo=informe sin anio devuelve 400", async () => {
    expect((await comtradeList(ctx({ modo: "informe" }))).status).toBe(400);
  });

  it("modo=informe resume totales, RCA y tablas en Markdown", async () => {
    const filasCap04 = [
      { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "04", fob_usd: "10000000", cif_usd: null, primary_usd: "10000000", es_estimado: false, es_agregado: true },
      { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: "100000000", cif_usd: null, primary_usd: "100000000", es_estimado: false, es_agregado: true },
      { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "08", fob_usd: "5000000", cif_usd: null, primary_usd: "5000000", es_estimado: false, es_agregado: true },
      { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: "500000000", cif_usd: null, primary_usd: "500000000", es_estimado: false, es_agregado: true },
    ];
    const filasTotales = [
      { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100000000", cif_usd: null, primary_usd: "100000000", es_estimado: true, es_agregado: true },
      { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000000000", cif_usd: null, primary_usd: "10000000000", es_estimado: true, es_agregado: true },
    ];
    dbQuery
      .mockResolvedValueOnce({ rows: filasCap04 }) // cargarRca: capítulos
      .mockResolvedValueOnce({ rows: filasTotales }) // cargarRca: totales
      .mockResolvedValueOnce({ rows: filasCap04 }) // cargarSerie: capítulos
      .mockResolvedValueOnce({ rows: filasTotales }) // cargarSerie: totales
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "04", fob_usd: null, cif_usd: "2000000000", primary_usd: "2000000000", es_estimado: false, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "08", fob_usd: null, cif_usd: "5000000000", primary_usd: "5000000000", es_estimado: false, es_agregado: true },
        ],
      }) // cargarOportunidad: capítulos (un solo año de Mundo M → sin CAGR)
      .mockResolvedValueOnce({
        rows: [
          { anio: 2024, flujo: "X", reporter_code: "604", partner_code: "0", cmd_code: "TOTAL", fob_usd: "100000000", cif_usd: null, primary_usd: "100000000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "X", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: "10000000000", cif_usd: null, primary_usd: "10000000000", es_estimado: true, es_agregado: true },
          { anio: 2024, flujo: "M", reporter_code: "0", partner_code: "0", cmd_code: "TOTAL", fob_usd: null, cif_usd: "100000000000", primary_usd: "100000000000", es_estimado: true, es_agregado: true },
        ],
      });

    const res = await comtradeList(ctx({ modo: "informe", anio: 2024 }));
    expect(res.status).toBe(200);
    const body = res.body as { markdown: string; advertencias: string[] };
    expect(body.markdown).toContain("# Informe Comtrade — reporter 604, 2024, flujo X");
    expect(body.markdown).toContain("## Ventaja comparativa revelada");
    expect(body.markdown).toContain("| 04 | Lácteos, huevos y miel |");
    expect(body.markdown).toContain("Café, té y especias finas");
    expect(body.markdown).toContain("Total del país: $100M");
    expect(body.advertencias).toEqual([]);
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
