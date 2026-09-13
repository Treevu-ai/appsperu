import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: vi.fn() },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    codigo_infobras: "6",
    codigo_entidad: "0608",
    entidad_nombre: "PROYECTO ESPECIAL CHAVIMOCHIC",
    nombre_obra: "CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU",
    modalidad_ejecucion: "Contrata",
    naturaleza_obra: "Construcción/Creación",
    estado_ejecucion: "En Ejecución",
    nivel_gobierno: "GOBIERNO REGIONAL",
    sector_entidad: "AGRICULTURA",
    cui: "2111665",
    departamento: "LA LIBERTAD",
    provincia: "VIRU",
    distrito: "VIRU",
    monto_viable: "1000000",
    costo_actualizado: "1500000",
    avance_fisico_prog_pct: "50",
    avance_fisico_real_pct: "80",
    ejecucion_financiera_pct: "50",
    existe_paralizacion: false,
    causal_paralizacion: null,
    fecha_paralizacion: null,
    dias_paralizado: null,
    fetched_at: "2026-08-16T22:04:00.000Z",
    ...overrides,
  };
}

describe("GET /api/public-works", () => {
  it("returns the list with derived signals computed", async () => {
    queryMock.mockResolvedValueOnce({ rows: [dbRow()] });

    const app = createApp();
    const res = await request(app).get("/api/public-works").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({
      codigoInfobras: "6",
      costDriftPct: 50,
      gapFisicoFinanciero: 30,
    });
  });

  it("applies the departamento, estado and conParalizacion filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app)
      .get("/api/public-works")
      .query({ departamento: "LA LIBERTAD", estado: "En Ejecución", conParalizacion: "true" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/pw\.departamento = \$1/);
    expect(sql).toMatch(/pw\.estado_ejecucion = \$2/);
    expect(sql).toMatch(/pw\.existe_paralizacion = true/);
    expect(params).toEqual(["LA LIBERTAD", "En Ejecución"]);
  });

  it("applies the distritoSospechoso filter (DQ-14)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app).get("/api/public-works").query({ distritoSospechoso: "true" });

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/pw\.distrito_sospechoso = true/);
  });

  it("PV-03: applies sectorEntidad, diasParalizadoMin and orderBy=diasParalizado_desc", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app)
      .get("/api/public-works")
      .query({ sectorEntidad: "PRODUCCIÓN", conParalizacion: "true", diasParalizadoMin: 180, orderBy: "diasParalizado_desc" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/pw\.existe_paralizacion = true/);
    expect(sql).toMatch(/pw\.sector_entidad = \$1/);
    expect(sql).toMatch(/pw\.dias_paralizado >= \$2/);
    expect(sql).toMatch(/ORDER BY pw\.dias_paralizado DESC NULLS LAST/);
    expect(params).toEqual(["PRODUCCIÓN", 180]);
  });

  it("PV-03: sin orderBy mantiene el orden por nombre existente (regresión)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app).get("/api/public-works").query({ departamento: "LA LIBERTAD" });

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/ORDER BY pw\.nombre_obra ASC/);
  });

  it("PV-03: diasParalizadoMin sin conParalizacion=true responde 400 explícito, no lo ignora en silencio", async () => {
    const app = createApp();
    const res = await request(app).get("/api/public-works").query({ diasParalizadoMin: 180 });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("PV-04: sin sectorEntidad, el ranking de obras paralizadas es nacional (filtro opcional)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    await request(app)
      .get("/api/public-works")
      .query({ conParalizacion: "true", diasParalizadoMin: 180, orderBy: "diasParalizado_desc" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/pw\.sector_entidad/);
    expect(sql).toMatch(/pw\.dias_paralizado >= \$1/);
    expect(params).toEqual([180]);
  });
});

describe("GET /api/public-works (validación de query)", () => {
  it("responde 400 cuando departamento llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/public-works?departamento=a&departamento=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("PV-03: un orderBy no soportado responde 400, nunca lo ignora en silencio", async () => {
    const app = createApp();
    const res = await request(app).get("/api/public-works").query({ orderBy: "loQueSea" });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/public-works/resumen", () => {
  it("returns aggregate coverage percentages, not raw counts", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { total: "10141", con_paralizacion: "252", con_avance_reportado: "8241", con_distrito_sospechoso: "7" },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/public-works/resumen");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalObras: 10141,
      conParalizacionPct: 2.48,
      conAvanceReportadoPct: 81.26,
      conDistritoSospechoso: 7,
    });
  });

  it("returns zeros instead of dividing by zero when there are no rows", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ total: "0", con_paralizacion: "0", con_avance_reportado: "0", con_distrito_sospechoso: "0" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/public-works/resumen");

    expect(res.body).toEqual({
      totalObras: 0,
      conParalizacionPct: 0,
      conAvanceReportadoPct: 0,
      conDistritoSospechoso: 0,
    });
  });

  it("DQ-06: groupBy=nivelGobierno desglosa por categoría, sumando el total departamental", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ total: "10134", con_paralizacion: "252", con_avance_reportado: "8241", con_distrito_sospechoso: "7" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { grupo: "GOBIERNO LOCAL", total: "7000", con_paralizacion: "180", con_avance_reportado: "5600" },
          { grupo: "GOBIERNO NACIONAL", total: "2134", con_paralizacion: "50", con_avance_reportado: "1800" },
          { grupo: "GOBIERNO REGIONAL", total: "1000", con_paralizacion: "22", con_avance_reportado: "841" },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/public-works/resumen").query({ groupBy: "nivelGobierno" });

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe("nivelGobierno");
    expect(res.body.porGrupo).toHaveLength(3);
    const sumaGrupos = res.body.porGrupo.reduce((acc: number, g: { total: number }) => acc + g.total, 0);
    expect(sumaGrupos).toBe(res.body.totalObras);

    const [groupSql] = queryMock.mock.calls[1];
    expect(groupSql).toMatch(/GROUP BY nivel_gobierno/);
  });

  it("DQ-06: un groupBy no soportado responde 400 explícito, nunca lo ignora en silencio", async () => {
    const app = createApp();
    const res = await request(app).get("/api/public-works/resumen").query({ groupBy: "loQueSea" });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/public-works/:codigoInfobras", () => {
  it("returns 404 when the work was not ingested", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/public-works/nope");

    expect(res.status).toBe(404);
  });

  it("returns the full ficha with signals for a real work", async () => {
    queryMock.mockResolvedValueOnce({ rows: [dbRow()] });

    const app = createApp();
    const res = await request(app).get("/api/public-works/6");

    expect(res.status).toBe(200);
    expect(res.body.nombreObra).toBe("CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU");
    expect(res.body.costDriftPct).toBe(50);
  });
});
