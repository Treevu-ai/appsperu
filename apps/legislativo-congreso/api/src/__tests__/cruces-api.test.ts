/**
 * Tests para las rutas de cruces proyectos de ley × INFOBRAS.
 *
 * Mocks en lugar de BD real, siguiendo el patrón de api.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const infoobrasQueryMock = vi.fn();
const requireCrossAppPoolMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

vi.mock("../lib/cross-app-pool.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/cross-app-pool.js")>(
    "../lib/cross-app-pool.js"
  );
  return {
    ...actual,
    requireCrossAppPool: requireCrossAppPoolMock,
  };
});

const { createApp } = await import("../app.js");

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

function obraRow(nombreObra = "Construccion de obras publicas", overrides: Record<string, unknown> = {}) {
  return {
    codigo_infobras: "OBR-001",
    codigo_entidad: "ENT-001",
    entidad_nombre: "Municipalidad",
    nombre_obra: nombreObra,
    modalidad_ejecucion: "administracion directa",
    naturaleza_obra: "construccion",
    estado_ejecucion: "en ejecucion",
    nivel_gobierno: "municipal",
    sector_entidad: "urbanismo",
    cui: "123456",
    nombre_inversion: null,
    monto_viable: "1000.5",
    costo_actualizado: "1500",
    departamento: "LA LIBERTAD",
    provincia: "TRUJILLO",
    distrito: "TRUJILLO",
    avance_fisico_real_pct: "45",
    ejecucion_financiera_pct: "30",
    existe_paralizacion: false,
    causal_paralizacion: null,
    fecha_paralizacion: null,
    dias_paralizado: null,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  infoobrasQueryMock.mockReset();
  requireCrossAppPoolMock.mockReset();
  requireCrossAppPoolMock.mockReturnValue({ query: infoobrasQueryMock });
});

describe("GET /api/cruces/proyectos-infobras", () => {
  it("responde 400 para departamento vacío sin tocar la BD", async () => {
    const res = await request(createApp()).get("/api/cruces/proyectos-infobras?departamento=");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 400 para umbral_score fuera de rango", async () => {
    const res = await request(createApp()).get("/api/cruces/proyectos-infobras?umbral_score=5");
    expect(res.status).toBe(400);
  });

  it("devuelve cruces con score y keywords coincidentes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infoobrasQueryMock.mockResolvedValueOnce({ rows: [obraRow()] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    // El título "Ley de obras publicas" aporta 3 keywords (ley, obras, publicas);
    // la obra contiene 2 de ellas.
    expect(res.body.resultados[0].matchScore).toBeCloseTo(2 / 3, 5);
    expect(res.body.resultados[0].matchedKeywords).toEqual(["obras", "publicas"]);
    expect(res.body.resultados[0].obra.nombreObra).toContain("obras publicas");
    expect(res.body.fuente).toHaveProperty("dataset");
  });

  it("preserva un 0 real en montos en vez de convertirlo a null", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infoobrasQueryMock.mockResolvedValueOnce({
      rows: [obraRow("Obras publicas", { monto_viable: "0", costo_actualizado: "0" })],
    });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras");
    expect(res.body.resultados[0].obra.montoViable).toBe(0);
    expect(res.body.resultados[0].obra.costoActualizado).toBe(0);
  });

  it("no filtra obras por debajo del umbral", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow({ titulo: "Ley de obras publicas" })] });
    infoobrasQueryMock.mockResolvedValueOnce({ rows: [obraRow("Construccion de caminos rurales")] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras?umbral_score=0.9");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("emite UNA sola query a INFOBRAS aunque haya muchos proyectos", async () => {
    const proyectos = Array.from({ length: 50 }, (_, i) =>
      proyectoRow({ pley_num: 1000 + i, titulo: `Ley de obras publicas numero ${i}` })
    );
    queryMock.mockResolvedValueOnce({ rows: proyectos });
    infoobrasQueryMock.mockResolvedValueOnce({ rows: [obraRow()] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras");

    expect(res.status).toBe(200);
    expect(infoobrasQueryMock).toHaveBeenCalledTimes(1);
  });

  it("parametriza el periodo en vez de hardcodearlo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/cruces/proyectos-infobras?periodo=2021");

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/per_par_id = \$1/);
    expect(params).toEqual([2021]);
  });

  it("pagina los resultados", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infoobrasQueryMock.mockResolvedValueOnce({
      rows: Array.from({ length: 5 }, (_, i) => obraRow(`Obras publicas ${i}`, { codigo_infobras: `OBR-00${i}` })),
    });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras?limit=2&offset=0");

    expect(res.body.total).toBe(5);
    expect(res.body.resultados).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
  });

  it("responde 503 cuando INFOBRAS no está configurada", async () => {
    const { CrossAppUnavailableError } = await import("../lib/cross-app-pool.js");
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    requireCrossAppPoolMock.mockImplementation(() => {
      throw new CrossAppUnavailableError("infobras");
    });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras");
    expect(res.status).toBe(503);
    expect(res.body.detalle).toContain("infobras");
  });
});

describe("GET /api/cruces/proyectos-infobras/:periodo/:numero", () => {
  it("responde 400 para periodo no numérico", async () => {
    const res = await request(createApp()).get("/api/cruces/proyectos-infobras/abc/123");
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 404 cuando el proyecto no existe", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras/2026/999999");
    expect(res.status).toBe(404);
  });

  it("responde 404 cuando el proyecto existe pero ninguna obra matchea", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infoobrasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras/2026/1234");
    expect(res.status).toBe(404);
  });

  it("devuelve los cruces de un proyecto concreto", async () => {
    queryMock.mockResolvedValueOnce({ rows: [proyectoRow()] });
    infoobrasQueryMock.mockResolvedValueOnce({ rows: [obraRow()] });

    const res = await request(createApp()).get("/api/cruces/proyectos-infobras/2026/1234");

    expect(res.status).toBe(200);
    expect(res.body.proyecto).toEqual({ perParId: 2026, pleyNum: 1234 });
    expect(res.body.total).toBe(1);
  });
});