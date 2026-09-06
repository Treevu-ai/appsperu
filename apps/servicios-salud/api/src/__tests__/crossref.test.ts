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

describe("GET /api/crossref (servicios-salud)", () => {
  it("distrito con inversión en salud y sin IPRESS activos: puntoCiego=true", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", inversiones: "2", monto_viable_total: "500000", costo_actualizado_total: "600000" }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(fila.puntoCiego).toBe(true);
    expect(fila.ipress).toBeNull();
    expect(fila.inversionSalud.montoViableTotal).toBe(500000);
  });

  it("distrito con IPRESS activos y sin inversión: puntoCiego=false, inversionSalud=null", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130102", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "EL PORVENIR", total: "3", activos: "3" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130102");
    expect(fila.puntoCiego).toBe(false);
    expect(fila.inversionSalud).toBeNull();
    expect(fila.ipress).toEqual({ total: 3, activos: 3 });
  });

  it("distrito con inversión y con IPRESS activos: puntoCiego=false", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130103", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "LA ESPERANZA", inversiones: "1", monto_viable_total: "100000", costo_actualizado_total: "100000" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130103", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "LA ESPERANZA", total: "2", activos: "1" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130103");
    expect(fila.puntoCiego).toBe(false);
    expect(fila.inversionSalud.inversiones).toBe(1);
    expect(fila.ipress).toEqual({ total: 2, activos: 1 });
  });

  it("distrito con inversión pero IPRESS registrados y ninguno activo: puntoCiego=true", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130104", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "FLORENCIA DE MORA", inversiones: "1", monto_viable_total: "200000", costo_actualizado_total: "200000" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130104", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "FLORENCIA DE MORA", total: "1", activos: "0" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130104");
    expect(fila.puntoCiego).toBe(true);
  });

  it("sin inversión y sin IPRESS: el distrito ni siquiera aparece en resultados", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.resultados).toEqual([]);
  });

  it("declara la cobertura territorial real de investments, consultada en vivo (no hardcodeada)", async () => {
    mockCobertura(["LA LIBERTAD", "PIURA"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.coberturaInversion.departamentosConDatos).toEqual(["LA LIBERTAD", "PIURA"]);
  });

  it("consulta ambas funciones de salud confirmadas en vivo, no solo 'SALUD'", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref");

    const investmentsCall = inversionesQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("FROM investments") && sql.includes("GROUP BY"));
    expect(investmentsCall![1][0]).toEqual(["SALUD", "SALUD Y SANEAMIENTO"]);
  });

  it("acepta un departamento distinto de La Libertad por query param", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref").query({ departamento: "piura" });

    const investmentsCall = inversionesQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("FROM investments") && sql.includes("GROUP BY"));
    expect(investmentsCall![1][1]).toBe("PIURA");
  });
});
