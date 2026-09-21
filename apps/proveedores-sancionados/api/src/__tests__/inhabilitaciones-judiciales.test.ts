import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: vi.fn() },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

const FILA_DB = {
  fecha_corte: "2026-09-01",
  ruc_dni: "10040039711",
  nombre: "BARRETO MARCELO TEODORO",
  organo_jurisdiccional: "Corte Superior de Justicia de Pasco",
  numero_resolucion: "SENTENCIA DE FECHA 28.04.2017",
  fecha_inicio: "2017-04-28",
  fecha_fin: "2025-04-28",
};

describe("GET /api/inhabilitaciones-judiciales", () => {
  it("lista con paginación real, incluye la limitation explícita", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({ rows: [FILA_DB] });

    const res = await request(createApp()).get("/api/inhabilitaciones-judiciales");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, limit: 200, offset: 0, hasMore: false });
    expect(res.body.resultados[0]).toEqual({
      fechaCorte: "2026-09-01",
      rucDni: "10040039711",
      nombre: "BARRETO MARCELO TEODORO",
      organoJurisdiccional: "Corte Superior de Justicia de Pasco",
      numeroResolucion: "SENTENCIA DE FECHA 28.04.2017",
      fechaInicio: "2017-04-28",
      fechaFin: "2025-04-28",
    });
    expect(res.body.limitation).toMatch(/mandato judicial/i);
  });

  it("filtra por rucDni", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({ rows: [FILA_DB] });

    await request(createApp()).get("/api/inhabilitaciones-judiciales").query({ rucDni: "10040039711" });

    const [countSql, countParams] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/ruc_dni = \$1/);
    expect(countParams).toEqual(["10040039711"]);
  });

  it("filtra por dni (8 dígitos)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/inhabilitaciones-judiciales").query({ dni: "04003971" });

    expect(res.status).toBe(200);
    const [countSql] = queryMock.mock.calls[0];
    expect(countSql).toMatch(/dni = \$1/);
  });

  it("rechaza un dni que no tiene 8 dígitos, sin consultar la base", async () => {
    const res = await request(createApp()).get("/api/inhabilitaciones-judiciales").query({ dni: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
