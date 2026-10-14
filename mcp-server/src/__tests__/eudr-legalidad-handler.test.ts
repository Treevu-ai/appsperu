/**
 * Tests del handler `identidad_fiscal_eudr_legalidad` — cierra la deriva CX-15
 * del endpoint Express que existía sin tool MCP. Replica el SQL de
 * `apps/identidad-fiscal/api/src/routes/eudr-legalidad.ts` (parcelas en base
 * propia + OEFA + OSCE/RNP cruzadas, ahora secuenciales por el tope de
 * conexiones del Worker).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPoolForApp } from "../db/neon-env.js";
import { list } from "../handlers/identidad-fiscal/eudr-legalidad.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

vi.mock("../db/neon-env.js", () => ({
  getPoolForApp: vi.fn(),
}));

const getPool = vi.mocked(getPoolForApp);

const dbQuery = vi.fn();
const ambientalQuery = vi.fn();
const sancionadosQuery = vi.fn();

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
}

beforeEach(() => {
  dbQuery.mockReset();
  ambientalQuery.mockReset();
  sancionadosQuery.mockReset();
  getPool.mockReset();
});

describe("eudr-legalidad:list", () => {
  it("RUC inválido devuelve 400 sin tocar ninguna base", async () => {
    const res = await list(ctx({ ruc: "123" }));
    expect(res.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("cruza las tres bases y marca REVISAR con inhabilitación vigente", async () => {
    getPool.mockImplementation((_env, app) => {
      if (app === "infracciones-ambientales") return { query: ambientalQuery } as never;
      if (app === "proveedores-sancionados") return { query: sancionadosQuery } as never;
      return null;
    });
    dbQuery.mockResolvedValueOnce({ rows: [{ codigo_parcela: "PE-001" }] });
    ambientalQuery.mockResolvedValueOnce({
      rows: [
        { nro_expediente: "EXP-1", fecha_rd: "2025-01-01", detalle_infraccion: "tala", tipo_sancion: "MULTA", cantidad_multa: "50" },
      ],
    });
    sancionadosQuery
      .mockResolvedValueOnce({
        rows: [
          { resolucion: "R-1", desde: "2025-02-01", hasta: null, infraccion: "incumplimiento", estado: "VIGENTE" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({ ruc: "20100004901" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      ruc: string;
      parcelasRegistradas: string[];
      sancionesAmbientalesOefa: Array<{ multaUit: number }>;
      inhabilitacionesOsce: Array<{ vigente: boolean }>;
      riesgo: { inhabilitacionVigente: boolean; algunaSancionAmbiental: boolean; nivel: string };
      enriquecimiento: Record<string, string>;
      aclaracion: string;
    };
    expect(body.ruc).toBe("20100004901");
    expect(body.parcelasRegistradas).toEqual(["PE-001"]);
    expect(body.sancionesAmbientalesOefa[0].multaUit).toBe(50);
    expect(body.inhabilitacionesOsce[0].vigente).toBe(true);
    expect(body.riesgo.nivel).toBe("REVISAR");
    expect(body.enriquecimiento.ambiental).toBe("ok");
    expect(body.aclaracion).toContain("no una certificación");
  });

  it("sin bases cruzadas responde ENRIQUECIMIENTO_NO_CONFIGURADO, no falla", async () => {
    getPool.mockReturnValue(null);
    dbQuery.mockResolvedValueOnce({ rows: [] });
    const res = await list(ctx({ ruc: "20100004901" }));
    expect(res.status).toBe(200);
    const body = res.body as { riesgo: { nivel: string }; enriquecimiento: Record<string, string> };
    expect(body.riesgo.nivel).toBe("SIN_HALLAZGOS");
    expect(body.enriquecimiento.ambiental).toBe("ENRIQUECIMIENTO_NO_CONFIGURADO");
    expect(body.enriquecimiento.contratacionPublica).toBe("ENRIQUECIMIENTO_NO_CONFIGURADO");
  });
});
