import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const comprasQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();

vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: sancionadosQueryMock },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

const AWARD_ROW = {
  ocid: "ocds-peru-1",
  award_id: "AWARD-1",
  supplier_id: "PE-RUC-20601567335",
  supplier_name: "FERCONSS CORPORATIVO S.A",
  buyer_name: "MINISTERIO DE LA PRODUCCION",
  valor_monto: "150000.00",
  valor_moneda: "PEN",
  fecha: "2026-05-10",
};

const INHABILITACION_VIGENTE = {
  ruc: "20601567335",
  estado: "VIGENTE",
  periodo_inhabilitacion: "24 meses",
  resolucion: "7793-2026-TCP-S2",
  desde: "2026-12-02",
  hasta: "2028-12-02",
  fetched_at: "2026-09-07T00:00:00Z",
};

function mockCrossrefQueries({
  inhabilitaciones = [] as unknown[],
  insertados = [] as unknown[],
} = {}) {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
  comprasQueryMock
    .mockResolvedValueOnce({ rows: [AWARD_ROW] }) // awards
    .mockResolvedValueOnce({ rows: [] }); // minor_contracts
  sancionadosQueryMock
    .mockResolvedValueOnce({ rows: inhabilitaciones }) // inhabilitaciones
    .mockResolvedValueOnce({ rows: insertados }); // sanciones_contratos_vistos (INSERT ... RETURNING)
}

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/crossref (PV-05: esNuevoDesdeUltimaCorrida)", () => {
  it("marca un caso sancionado como nuevo cuando el INSERT ... RETURNING confirma que se insertó de verdad", async () => {
    // El mock de INSERT ... RETURNING devuelve exactamente la fila insertada —
    // así es como Postgres se comporta realmente: RETURNING solo trae las filas
    // que la sentencia insertó, nunca las que chocaron con ON CONFLICT DO NOTHING.
    mockCrossrefQueries({
      inhabilitaciones: [INHABILITACION_VIGENTE],
      insertados: [{ ruc: "20601567335", referencia_contrato: "awards:ocds-peru-1:AWARD-1" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    const result = res.body.resultados[0];
    expect(result.tieneInhabilitacionVigente).toBe(true);
    expect(result.esNuevoDesdeUltimaCorrida).toBe(true);

    // Segunda llamada a sancionadosQueryMock es el INSERT ... RETURNING.
    const insertCall = sancionadosQueryMock.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO sanciones_contratos_vistos/);
    expect(insertCall[0]).toMatch(/RETURNING ruc, referencia_contrato/);
    expect(insertCall[0]).toMatch(/ON CONFLICT \(ruc, referencia_contrato\) DO NOTHING/);
    expect(insertCall[1]).toEqual(["20601567335", "awards:ocds-peru-1:AWARD-1"]);
  });

  it("no marca como nuevo un caso ya presente (RETURNING vacío porque ON CONFLICT DO NOTHING lo descartó)", async () => {
    mockCrossrefQueries({
      inhabilitaciones: [INHABILITACION_VIGENTE],
      insertados: [], // el par ya existía: la sentencia no insertó nada, RETURNING no trae filas.
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    const result = res.body.resultados[0];
    expect(result.tieneInhabilitacionVigente).toBe(true);
    expect(result.esNuevoDesdeUltimaCorrida).toBe(false);

    // Dos llamadas a sancionadosQueryMock: inhabilitaciones + el INSERT ... RETURNING (que no trajo filas).
    expect(sancionadosQueryMock).toHaveBeenCalledTimes(2);
  });

  it("no toca sanciones_contratos_vistos cuando ningún proveedor tiene inhabilitación vigente", async () => {
    mockCrossrefQueries({ inhabilitaciones: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    const result = res.body.resultados[0];
    expect(result.tieneInhabilitacionVigente).toBe(false);
    expect(result.esNuevoDesdeUltimaCorrida).toBe(false);

    // Solo la consulta de inhabilitaciones — sin INSERT sobre sanciones_contratos_vistos.
    expect(sancionadosQueryMock).toHaveBeenCalledTimes(1);
  });

  it("preserva el filtro soloInhabilitados existente junto al campo nuevo", async () => {
    mockCrossrefQueries({ inhabilitaciones: [] });

    const app = createApp();
    const res = await request(app)
      .get("/api/crossref")
      .query({ departamento: "LIMA", soloInhabilitados: "true" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(0);
  });
});

describe("GET /api/crossref (PV-06: departamento=TODOS y soloNuevos)", () => {
  it("departamento=TODOS agrega awards y minor_contracts sin filtrar por departamento", async () => {
    mockCrossrefQueries({ inhabilitaciones: [], insertados: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref").query({ departamento: "TODOS" });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("TODOS");

    const [awardsSql, awardsParams] = comprasQueryMock.mock.calls[0];
    expect(awardsSql).not.toMatch(/WHERE departamento/);
    expect(awardsParams).toBeUndefined();

    const [minorSql, minorParams] = comprasQueryMock.mock.calls[1];
    expect(minorSql).not.toMatch(/m\.department = \$1/);
    expect(minorSql).toMatch(/c\.winning_supplier_id IS NOT NULL/);
    expect(minorParams).toBeUndefined();
  });

  it("soloNuevos=true devuelve solo los casos marcados esNuevoDesdeUltimaCorrida", async () => {
    mockCrossrefQueries({
      inhabilitaciones: [INHABILITACION_VIGENTE],
      insertados: [], // ya visto -> esNuevoDesdeUltimaCorrida: false
    });

    const app = createApp();
    const res = await request(app)
      .get("/api/crossref")
      .query({ departamento: "TODOS", soloNuevos: "true" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(0);
  });

  it("soloNuevos=true combinado con un caso realmente nuevo lo incluye", async () => {
    mockCrossrefQueries({
      inhabilitaciones: [INHABILITACION_VIGENTE],
      insertados: [{ ruc: "20601567335", referencia_contrato: "awards:ocds-peru-1:AWARD-1" }],
    });

    const app = createApp();
    const res = await request(app)
      .get("/api/crossref")
      .query({ departamento: "TODOS", soloNuevos: "true" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0].esNuevoDesdeUltimaCorrida).toBe(true);
  });
});
