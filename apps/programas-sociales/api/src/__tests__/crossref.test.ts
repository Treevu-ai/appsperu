import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const inversionesQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/inversiones-pool.js", () => ({
  inversionesPool: { query: inversionesQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  inversionesQueryMock.mockReset();
});

function mockCobertura(departamentos: string[]) {
  inversionesQueryMock.mockResolvedValueOnce({ rows: departamentos.map((departamento) => ({ departamento })) });
}

describe("GET /api/crossref (programas-sociales)", () => {
  it("distrito con inversión social y sin ningún corte de INFOMIDIS: puntoCiego=true", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", inversiones: "1", monto_viable_total: "300000", costo_actualizado_total: "300000" }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(fila.puntoCiego).toBe(true);
    expect(fila.coberturaSocial).toBeNull();
  });

  it("distrito con inversión social y con cobertura registrada: puntoCiego=false", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130102", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "EL PORVENIR", inversiones: "1", monto_viable_total: "100000", costo_actualizado_total: "100000" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130102", fecha_corte: "2026-04-30", juntos_hogares_afiliados: "50", pension65_usuarios: "10", qaliwarma_ninos_atendidos: "200" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130102");
    expect(fila.puntoCiego).toBe(false);
    expect(fila.coberturaSocial).toEqual({
      ubigeo: "130102",
      fechaCorte: "2026-04-30",
      juntosHogaresAfiliados: 50,
      pension65Usuarios: 10,
      qaliwarmaNinosAtendidos: 200,
    });
  });

  it("sin inversión social registrada: no aparece ningún resultado (solo se lista el lado de inversión)", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "999999", fecha_corte: "2026-04-30", juntos_hogares_afiliados: "1", pension65_usuarios: "1", qaliwarma_ninos_atendidos: "1" }],
    });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.resultados).toEqual([]);
  });

  it("declara la cobertura territorial real de investments, consultada en vivo", async () => {
    mockCobertura(["LA LIBERTAD", "CUSCO"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.coberturaInversion.departamentosConDatos).toEqual(["LA LIBERTAD", "CUSCO"]);
  });

  it("consulta ambas funciones de protección social confirmadas en vivo", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref");

    const investmentsCall = inversionesQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("FROM investments") && sql.includes("GROUP BY"));
    expect(investmentsCall![1][0]).toEqual(["PROTECCIÓN SOCIAL", "ASISTENCIA Y PREVISION SOCIAL"]);
  });

  it("acepta un departamento distinto de La Libertad por query param", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref").query({ departamento: "cusco" });

    const investmentsCall = inversionesQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("FROM investments") && sql.includes("GROUP BY"));
    expect(investmentsCall![1][1]).toBe("CUSCO");
  });
});
