import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const ejecucionQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  ejecucionQueryMock.mockReset();
});

describe("GET /api/crossref", () => {
  it("returns an empty list without querying radar-ejecucion when there are no investments", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultados: [] });
    expect(ejecucionQueryMock).not.toHaveBeenCalled();
  });

  it("merges investment totals with live devengado from radar-ejecucion by SEC_EJEC", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          sec_ejec: "300790",
          nombre_uep: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
          inversiones: "3",
          monto_viable_total: "5000000",
          costo_actualizado_total: "6200000",
        },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "300790", nombre: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO", devengado: "1200000" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      secEjec: "300790",
      enPresupuesto: true,
      inversiones: 3,
      montoViableTotal: 5000000,
      costoActualizadoTotal: 6200000,
      devengado: 1200000,
    });
  });

  it("flags enPresupuesto=false without dropping the row when the entity has no budget data", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          sec_ejec: "999999",
          nombre_uep: "ENTIDAD SIN PRESUPUESTO INGERIDO",
          inversiones: "1",
          monto_viable_total: "100000",
          costo_actualizado_total: "100000",
        },
      ],
    });
    ejecucionQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref");

    expect(res.body.resultados[0]).toMatchObject({ enPresupuesto: false, devengado: 0 });
  });
});
