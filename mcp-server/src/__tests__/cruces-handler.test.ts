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
    // Dos queries a INFOBRAS: el índice liviano y la hidratación de columnas
    // completas solo para la obra que matcheó.
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });

    const res = await list(ctx({}));

    expect(res.status).toBe(200);
    const body = res.body as { total: number; resultados: Array<{ matchScore: number; matchedKeywords: string[] }> };
    expect(body.total).toBe(1);
    expect(body.resultados[0].matchScore).toBeCloseTo(2 / 3, 5);
    expect(body.resultados[0].matchedKeywords).toEqual(["obras", "publicas"]);
  });

  it("consulta INFOBRAS un número fijo de veces, no una por proyecto", async () => {
    // El índice liviano es una query por request; la hidratación es una
    // segunda query acotada a los códigos de la página, sin importar cuántos
    // proyectos del periodo matchearon esa misma obra.
    const proyectos = Array.from({ length: 40 }, (_, i) =>
      proyectoRow({ pley_num: 1000 + i, titulo: `Ley de obras publicas ${i}` })
    );
    dbQuery.mockResolvedValueOnce({ rows: proyectos });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Obras publicas")] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Obras publicas")] });

    await list(ctx({}));

    expect(infobrasQuery).toHaveBeenCalledTimes(2);
  });

  it("parametriza el periodo con default 2026", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({}));
    expect(dbQuery.mock.calls[0][1]).toEqual([2026]);

    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({ periodo: 2021 }));
    expect(dbQuery.mock.calls[1][1]).toEqual([2021]);
  });

  it("no trunca: cuenta todas las obras que matchean y pagina sobre el total", async () => {
    // El corte anterior tomaba las 500 de codigo_infobras más bajo, lo que
    // sesgaba el cruce en vez de solo recortarlo.
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    const obras1500 = Array.from({ length: 1500 }, (_, i) => obraRow(`Obras publicas ${i}`, {
      codigo_infobras: `OBR-${String(i).padStart(4, "0")}`,
    }));
    infobrasQuery.mockResolvedValueOnce({ rows: obras1500 });
    infobrasQuery.mockResolvedValueOnce({ rows: obras1500 });

    const res = await list(ctx({}));

    const body = res.body as { total: number; hasMore: boolean; resultados: unknown[] };
    expect(body.total).toBe(1500);
    expect(body.resultados).toHaveLength(200);
    expect(body.hasMore).toBe(true);
    expect(res.body).not.toHaveProperty("truncated");
  });

  it("no matchea por subcadena: 'crea' no es 'CREACION'", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [proyectoRow({ titulo: "Ley que crea la Universidad Nacional de Ciencias de la Salud" })],
    });
    infobrasQuery.mockResolvedValueOnce({
      rows: [obraRow("CREACION DE LOS SERVICIOS DE SALUD DEL PUESTO DE SALUD")],
    });

    const res = await list(ctx({}));

    expect((res.body as { total: number }).total).toBe(0);
  });

  it("excluye el boilerplate administrativo del indice", async () => {
    // "distrito/provincia/departamento" vienen en el nombre de casi toda obra y
    // no distinguen una de otra dentro del mismo departamento.
    dbQuery.mockResolvedValueOnce({
      rows: [proyectoRow({ titulo: "Ley que declara distrito provincia departamento" })],
    });
    infobrasQuery.mockResolvedValueOnce({
      rows: [obraRow("MEJORAMIENTO DE LA RED DISTRITO PROVINCIA DEPARTAMENTO LA LIBERTAD")],
    });

    const res = await list(ctx({}));

    expect((res.body as { total: number }).total).toBe(0);
  });

  it("responde 503 —no cero— cuando INFOBRAS no está configurada", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    getPool.mockReturnValue(undefined as never);

    const res = await list(ctx({}));

    expect(res.status).toBe(503);
    expect((res.body as { detalle: string }).detalle).toContain("INFOBRAS");
  });

  it("responde 503 con periodo vacío si INFOBRAS no está configurada", async () => {
    // Antes devolvía 200 con total:0 sin mirar el pool, y eso hacía un periodo
    // vacío indistinguible de un cruce degradado.
    dbQuery.mockResolvedValueOnce({ rows: [] });
    getPool.mockReturnValue(undefined as never);

    const res = await list(ctx({}));

    expect(res.status).toBe(503);
  });

  it("devuelve vacío sin consultar obras si el periodo no tiene proyectos", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({}));

    expect(res.status).toBe(200);
    expect((res.body as { total: number }).total).toBe(0);
    expect(infobrasQuery).not.toHaveBeenCalled();
  });

  it("el 404 del proyecto individual ya no declara truncated", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow({ titulo: "Ley de obras publicas" })] });
    infobrasQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 501 }, (_, i) =>
        obraRow(`Obra sin relacion ${i}`, { codigo_infobras: `OBR-${i}` })
      ),
    });

    const res = await proyecto(ctx({ periodo: 2026, numero: 1234 }));

    expect(res.status).toBe(404);
    // Sin tope de candidatas el 404 tiene un solo significado.
    expect(res.body).not.toHaveProperty("truncated");
  });

  it("rechaza con 400 un departamento fuera del catálogo peruano", async () => {
    // Antes solo se hacía toUpperCase(): un departamento inexistente llegaba
    // tal cual a la query a INFOBRAS y volvía 200 con total:0, indistinguible
    // de "ese departamento no tiene obras".
    const res = await list(ctx({ departamento: "NARNIA" }));

    expect(res.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
    expect(infobrasQuery).not.toHaveBeenCalled();
  });

  it("resuelve el alias 'P C DEL CALLAO' a CALLAO antes de consultar", async () => {
    // Antes el alias llegaba sin resolver a la query exacta de INFOBRAS
    // (`WHERE departamento = $1`), que nunca matcheaba "P C DEL CALLAO" como
    // fila real y daba 0 cruces en silencio.
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({ rows: [] });

    await list(ctx({ departamento: "P C DEL CALLAO" }));

    expect(infobrasQuery.mock.calls[0][1]).toEqual(["CALLAO"]);
  });

  it("respeta limit y offset", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    const obras5 = Array.from({ length: 5 }, (_, i) =>
      obraRow(`Obras publicas ${i}`, { codigo_infobras: `OBR-00${i}` })
    );
    infobrasQuery.mockResolvedValueOnce({ rows: obras5 });
    infobrasQuery.mockResolvedValueOnce({ rows: obras5 });

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

  it("rechaza con 400 un departamento fuera del catálogo peruano", async () => {
    const res = await proyecto(ctx({ periodo: 2026, numero: 1234, departamento: "NARNIA" }));

    expect(res.status).toBe(400);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("resuelve el alias 'P C DEL CALLAO' a CALLAO antes de consultar", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });
    infobrasQuery.mockResolvedValueOnce({ rows: [obraRow("Construccion de obras publicas")] });

    await proyecto(ctx({ periodo: 2026, numero: 1234, departamento: "P C DEL CALLAO" }));

    expect(infobrasQuery.mock.calls[0][1]).toEqual(["CALLAO"]);
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