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

describe("GET /api/crossref (renamu)", () => {
  it("distrito con inversión GL pero sin vehículo operativo ni internet: puntoCiego=true", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", inversiones: "2", monto_viable_total: "500000", costo_actualizado_total: "600000" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", anio: 2025, tiene_vehiculo_operativo: false, tiene_internet: false }],
    });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    const fila = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(fila.puntoCiego).toBe(true);
    expect(fila.inversionGL.montoViableTotal).toBe(500000);
    expect(fila.capacidad).toEqual({ anio: 2025, tieneVehiculoOperativo: false, tieneInternet: false });
  });

  it("distrito con inversión GL y capacidad real (vehículo o internet): puntoCiego=false", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130102", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "EL PORVENIR", inversiones: "1", monto_viable_total: "100000", costo_actualizado_total: "100000" }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130102", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "EL PORVENIR", anio: 2025, tiene_vehiculo_operativo: true, tiene_internet: true }],
    });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.resultados[0].puntoCiego).toBe(false);
  });

  it("distrito con inversión GL pero sin ningún dato de RENAMU (municipalidad no encontrada): puntoCiego=true, capacidad=null", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "999999", departamento: "LA LIBERTAD", provincia: "X", distrito: "Y", inversiones: "1", monto_viable_total: "1000", costo_actualizado_total: "1000" }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.resultados[0].capacidad).toBeNull();
    expect(res.body.resultados[0].puntoCiego).toBe(true);
  });

  it("excluye registros de investments con distrito='- TODOS -' (agregados provinciales, no distritos reales)", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref");

    const [sql] = inversionesQueryMock.mock.calls[1];
    expect(sql).toMatch(/distrito <> '- TODOS -'/);
  });

  it("solo lista distritos con inversión GL real -- no infla con las ~1,500 municipalidades sin inversión en esta fuente", async () => {
    mockCobertura(["LA LIBERTAD"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130103", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "LA ESPERANZA", anio: 2025, tiene_vehiculo_operativo: true, tiene_internet: true }],
    });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.resultados).toEqual([]);
  });

  it("filtra la consulta de capacidad por año explícito (no usa MAX(anio))", async () => {
    mockCobertura([]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref").query({ anio: 2024 });

    const [sql, params] = poolQueryMock.mock.calls[0];
    expect(sql).toMatch(/m\.anio = COALESCE\(\$1::int/);
    expect(params[0]).toBe(2024);
  });

  it("expone la cobertura real de investments (nivel=GL), no un valor fijo", async () => {
    mockCobertura(["LA LIBERTAD", "LIMA"]);
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.coberturaInversion.departamentosConDatos).toEqual(["LA LIBERTAD", "LIMA"]);
  });
});
