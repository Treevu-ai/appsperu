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

/** Encola las respuestas en el orden real en que el router las pide:
 * 1) inversionesPool: cobertura de departamentos
 * 2) pool: último corte (anio, mes)
 * 3) pool: filas de empresas de ese corte (solo si hay último corte)
 * 4) inversionesPool: investments agregado
 */
function mockSequence(opts: {
  departamentos: string[];
  ultimoCorte: { anio: number; mes: number } | null;
  empresasRows?: unknown[];
  investmentRows?: unknown[];
}) {
  inversionesQueryMock.mockResolvedValueOnce({ rows: opts.departamentos.map((departamento) => ({ departamento })) });
  poolQueryMock.mockResolvedValueOnce({ rows: opts.ultimoCorte ? [opts.ultimoCorte] : [] });
  if (opts.ultimoCorte) {
    poolQueryMock.mockResolvedValueOnce({ rows: opts.empresasRows ?? [] });
  }
  inversionesQueryMock.mockResolvedValueOnce({ rows: opts.investmentRows ?? [] });
}

describe("GET /api/crossref (actividad-empresarial)", () => {
  it("distrito con inversión y con dato de empresas: ambos números presentes, sin puntoCiego", async () => {
    mockSequence({
      departamentos: ["LA LIBERTAD"],
      ultimoCorte: { anio: 2022, mes: 12 },
      empresasRows: [{ ubigeo: "130101", distrito: "TRUJILLO", anio: 2022, mes: 12, numero_empresas: "10660" }],
      investmentRows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", inversiones: "53", monto_viable_total: "1000000", costo_actualizado_total: "1100000" }],
    });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(fila).not.toHaveProperty("puntoCiego");
    expect(fila.empresasActivas).toEqual({ numeroEmpresas: 10660, fechaCorte: "2022-12" });
    expect(fila.inversionTotal.inversiones).toBe(53);
  });

  it("distrito con inversión y sin dato de empresas: empresasActivas=null", async () => {
    mockSequence({
      departamentos: ["LA LIBERTAD"],
      ultimoCorte: { anio: 2022, mes: 12 },
      empresasRows: [],
      investmentRows: [{ ubigeo: "130199", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "X", inversiones: "1", monto_viable_total: "1", costo_actualizado_total: "1" }],
    });

    const res = await request(createApp()).get("/api/crossref");
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130199");
    expect(fila.empresasActivas).toBeNull();
    expect(fila.inversionTotal).not.toBeNull();
  });

  it("distrito con dato de empresas y sin inversión: inversionTotal=null", async () => {
    mockSequence({
      departamentos: ["LA LIBERTAD"],
      ultimoCorte: { anio: 2022, mes: 12 },
      empresasRows: [{ ubigeo: "130102", distrito: "EL PORVENIR", anio: 2022, mes: 12, numero_empresas: "500" }],
      investmentRows: [],
    });

    const res = await request(createApp()).get("/api/crossref");
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130102");
    expect(fila.inversionTotal).toBeNull();
    expect(fila.empresasActivas.numeroEmpresas).toBe(500);
  });

  it("usa el corte más reciente disponible, no un año fijo en código", async () => {
    mockSequence({ departamentos: [], ultimoCorte: { anio: 2023, mes: 6 }, empresasRows: [], investmentRows: [] });
    await request(createApp()).get("/api/crossref");
    // La segunda llamada a pool (filas de empresas) debe filtrar por el corte devuelto (2023, 6).
    const empresasCall = poolQueryMock.mock.calls[1];
    expect(empresasCall[1]).toEqual([2023, 6]);
  });

  it("no incluye ningún campo puntoCiego en ningún resultado", async () => {
    mockSequence({
      departamentos: ["LA LIBERTAD"],
      ultimoCorte: { anio: 2022, mes: 12 },
      empresasRows: [{ ubigeo: "130103", distrito: "X", anio: 2022, mes: 12, numero_empresas: "1" }],
      investmentRows: [],
    });
    const res = await request(createApp()).get("/api/crossref");
    for (const fila of res.body.resultados) {
      expect(fila).not.toHaveProperty("puntoCiego");
    }
  });

  it("declara la cobertura territorial real de investments, consultada en vivo", async () => {
    mockSequence({ departamentos: ["LA LIBERTAD", "PIURA"], ultimoCorte: null, investmentRows: [] });
    const res = await request(createApp()).get("/api/crossref");
    expect(res.body.coberturaInversion.departamentosConDatos).toEqual(["LA LIBERTAD", "PIURA"]);
  });
});
