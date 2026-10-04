/**
 * Tests del handler MCP de cruces Congreso × INFOBRAS.
 *
 * El handler replica la lógica de
 * `apps/legislativo-congreso/api/src/crossref/infobras-matcher.ts`. Como el
 * código está duplicado a mano (mcp-server no importa las apps), estos tests
 * son la única red contra esa deriva.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPoolForApp } from "../db/neon-env.js";
import { list, proyecto } from "../handlers/legislativo-congreso/cruces.js";
import type { ToolHandlerContext } from "../handlers/registry.js";
import { TOOL_CATALOG } from "../catalog.js";

vi.mock("../db/neon-env.js", () => ({
  getPoolForApp: vi.fn(),
}));

const getPool = vi.mocked(getPoolForApp);

function proyectoRow(overrides: Record<string, unknown> = {}) {
  return {
    per_par_id: 2026,
    pley_num: 1234,
    proyecto_ley: "PL-01234",
    estado: "en comision",
    fecha_presentacion: "2026-03-01",
    titulo: "Ley de obras publicas",
    proponente: "Congresista",
    autores: null,
    ...overrides,
  };
}

function obraRow(nombreObra: string, overrides: Record<string, unknown> = {}) {
  return {
    codigo_infobras: "OBR-001",
    codigo_entidad: "ENT-001",
    entidad_nombre: "Municipalidad",
    nombre_obra: nombreObra,
    modalidad_ejecucion: null,
    naturaleza_obra: null,
    estado_ejecucion: null,
    nivel_gobierno: null,
    sector_entidad: null,
    cui: null,
    nombre_inversion: null,
    monto_viable: null,
    costo_actualizado: null,
    departamento: "LA LIBERTAD",
    provincia: null,
    distrito: null,
    avance_fisico_real_pct: null,
    ejecucion_financiera_pct: null,
    existe_paralizacion: false,
    causal_paralizacion: null,
    fecha_paralizacion: null,
    dias_paralizado: null,
    ...overrides,
  };
}

const dbQuery = vi.fn();
const infobrasQuery = vi.fn();

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return {
    db: { query: dbQuery } as never,
    args,
    tool: {} as never,
    env: {} as never,
  };
}

beforeEach(() => {
  dbQuery.mockReset();
  infobrasQuery.mockReset();
  getPool.mockReset();
  getPool.mockReturnValue({ query: infobrasQuery } as never);
});

describe("cruces:list", () => {
  it("devuelve cruces con score y keywords coincidentes", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });

    const res = await list(ctx({}));

    expect(res.status).toBe(200);
    const body = res.body as { total: number; truncated: boolean; resultados: Array<{ matchScore: number; matchedKeywords: string[] }> };
    expect(body.total).toBe(1);
    expect(body.truncated).toBe(false);
    expect(body.resultados[0].matchScore).toBeCloseTo(2 / 3, 5);
    expect(body.resultados[0].matchedKeywords).toEqual(["obras", "publicas"]);
  });

  it("emite UNA sola query a INFOBRAS para muchos proyectos", async () => {
    const proyectos = Array.from({ length: 40 }, (_, i) =>
      proyectoRow({ pley_num: 1000 + i, titulo: `Ley de obras publicas ${i}` })
    );
    dbQuery.mockResolvedValueOnce({ rows: proyectos });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Obras publicas")] });

    await list(ctx({}));

    expect(infobrasQuery).toHaveBeenCalledTimes(1);
  });

  it("parametriza el periodo con default 2026", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({}));
    expect(dbQuery.mock.calls[0][1]).toEqual([2026]);

    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({ periodo: 2021 }));
    expect(dbQuery.mock.calls[1][1]).toEqual([2021]);
  });

  it("reporta truncated:true cuando INFOBRAS devuelve más de 500 candidatas", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 501 }, (_, i) => obraRow(`Obra ${i}`)),
    });

    const res = await list(ctx({}));

    expect((res.body as { truncated: boolean }).truncated).toBe(true);
  });

  it("no reporta truncated con exactamente 500 candidatas", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 500 }, (_, i) => obraRow(`Obra ${i}`)),
    });

    const res = await list(ctx({}));

    expect((res.body as { truncated: boolean }).truncated).toBe(false);
  });

  it("responde 503 —no cero— cuando INFOBRAS no está configurada", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    getPool.mockReturnValue(undefined as never);

    const res = await list(ctx({}));

    expect(res.status).toBe(503);
    expect((res.body as { detalle: string }).detalle).toContain("INFOBRAS");
  });

  it("devuelve vacío sin tocar INFOBRAS si el periodo no tiene proyectos", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({}));

    expect(res.status).toBe(200);
    expect((res.body as { total: number }).total).toBe(0);
    expect(infobrasQuery).not.toHaveBeenCalled();
  });

  it("respeta limit y offset", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 5 }, (_, i) =>
        obraRow(`Obras publicas ${i}`, { codigo_infobras: `OBR-00${i}` })
      ),
    });

    const res = await list(ctx({ limit: 2, offset: 1 }));
    const body = res.body as { total: number; resultados: unknown[] };

    expect(body.total).toBe(5);
    expect(body.resultados).toHaveLength(2);
  });
});

describe("cruces:proyecto", () => {
  it("devuelve los cruces de un proyecto concreto", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });

    const res = await proyecto(ctx({ periodo: 2026, numero: 1234 }));

    expect(res.status).toBe(200);
    const body = res.body as { proyecto: { perParId: number; pleyNum: number }; total: number };
    expect(body.proyecto).toEqual({ perParId: 2026, pleyNum: 1234 });
    expect(body.total).toBe(1);
  });

  it("responde 404 si el proyecto no existe", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await proyecto(ctx({ periodo: 2026, numero: 999999 }));

    expect(res.status).toBe(404);
    expect(infobrasQuery).not.toHaveBeenCalled();
  });

  it("responde 404 si ninguna obra alcanza el umbral", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({ rows: [] });

    const res = await proyecto(ctx({ periodo: 2026, numero: 1234 }));

    expect(res.status).toBe(404);
  });

  it("responde 503 cuando INFOBRAS no está configurada", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    getPool.mockReturnValue(undefined as never);

    const res = await proyecto(ctx({ periodo: 2026, numero: 1234 }));

    expect(res.status).toBe(503);
  });
});

describe("integridad del catálogo", () => {
  it("los 2 tools de cruces apuntan a rutas que la app Express expone", () => {
    const cruces = TOOL_CATALOG.filter((t) => t.app === "legislativo-congreso" && t.name.includes("cruce"));
    expect(cruces.map((t) => t.pathTemplate).sort()).toEqual([
      "/api/cruces/proyectos-infobras",
      "/api/cruces/proyectos-infobras/{periodo}/{numero}",
    ]);
  });

  it("el tool declara que 503 no es cero resultados", () => {
    const tool = TOOL_CATALOG.find((t) => t.name === "legislativo_congreso_cruces_infobras");
    expect(tool?.description).toMatch(/503/);
    expect(tool?.description).toMatch(/truncated/);
  });
});