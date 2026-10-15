/**
 * `identidad_fiscal_exportaciones_fob` con `groupBy` (agregación por aduana,
 * país o agente) — la vía de una fila por dimensión con FOB total y nº de
 * embarques, paginada sobre los grupos, y su validación 400.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { list } from "../handlers/identidad-fiscal/exportaciones-fob.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const dbQuery = vi.fn();

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
}

beforeEach(() => {
  dbQuery.mockReset();
});

describe("identidad_fiscal_exportaciones_fob con groupBy", () => {
  it("groupBy inválido devuelve 400 con los valores posibles y sin consultar", async () => {
    const res = await list(ctx({ groupBy: "ruc" }));
    expect(res.status).toBe(400);
    expect(String((res.body as { error: string }).error)).toContain("aduana, pais, agente");
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("groupBy=aduana cuenta grupos y agrega FOB por aduana con los filtros aplicados", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ total: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          { codigo: "0100", nombre: "CALLAO", fob_usd: "5000000.55", filas: "40" },
          { codigo: "1300", nombre: "LIMA", fob_usd: "2500000.00", filas: "15" },
        ],
      });

    const res = await list(ctx({ groupBy: "aduana", anio: 2025, limit: 100, offset: 0 }));
    expect(res.status).toBe(200);

    const [countSql, countParams] = dbQuery.mock.calls[0];
    expect(countSql as string).toContain(
      "SELECT COUNT(*) AS total FROM (SELECT 1 FROM ruc_exportaciones_fob WHERE anio = $1 GROUP BY aduana_codigo, aduana_nombre) AS grupos"
    );
    expect(countParams).toEqual([2025]);

    const [dataSql, dataParams] = dbQuery.mock.calls[1];
    expect(dataSql as string).toContain("GROUP BY aduana_codigo, aduana_nombre");
    expect(dataSql as string).toContain("ORDER BY SUM(fob_usd) DESC");
    expect(dataParams).toEqual([2025, 100, 0]);

    const body = res.body as {
      groupBy: string;
      total: number;
      hasMore: boolean;
      resultados: Array<{ codigo: string; nombre: string; fobUsd: number; filas: number }>;
    };
    expect(body.groupBy).toBe("aduana");
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
    expect(body.resultados[0]).toEqual({ codigo: "0100", nombre: "CALLAO", fobUsd: 5000000.55, filas: 40 });
  });

  it("groupBy=pais usa la dimensión de país y pagina sobre los grupos", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ total: "300" }] })
      .mockResolvedValueOnce({ rows: [{ codigo: "US", nombre: "ESTADOS UNIDOS", fob_usd: "100", filas: "1" }] });

    const res = await list(ctx({ groupBy: "pais", limit: 100, offset: 200 }));
    expect(res.status).toBe(200);

    const [countSql] = dbQuery.mock.calls[0];
    expect(countSql as string).toContain("GROUP BY pais_codigo, pais_nombre");
    const body = res.body as { total: number; hasMore: boolean };
    expect(body.total).toBe(300);
    expect(body.hasMore).toBe(true); // 200 + 1 < 300
  });

  it("sin groupBy mantiene la respuesta de filas individuales con total/hasMore", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20123456789",
            anio: 2025,
            mes: 3,
            aduana_codigo: "0100",
            aduana_nombre: "CALLAO",
            agente_codigo: "A1",
            agente_nombre: "AGENTE A",
            pais_codigo: "US",
            pais_nombre: "ESTADOS UNIDOS",
            fob_usd: 99.5,
            fecha_consulta: "20260101",
          },
        ],
      });

    const res = await list(ctx({ ruc: "20123456789" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      total: number;
      hasMore: boolean;
      resultados: Array<{ ruc: string; fobUsd: number }>;
    };
    expect(body.total).toBe(1);
    expect(body.hasMore).toBe(false);
    expect(body.resultados[0].ruc).toBe("20123456789");
    expect(body.resultados[0].fobUsd).toBe(99.5);
    // El count de la vía por filas no lleva subselect de grupos:
    expect(dbQuery.mock.calls[0][0] as string).toContain("SELECT COUNT(*) AS total FROM ruc_exportaciones_fob WHERE ruc = $1");
  });
});
