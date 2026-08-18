import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /health", () => {
  it("responds ok without touching the database", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/meta/sources", () => {
  it("returns traceability info for the most recent ingestion batches", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          resource_id: "abc-123",
          fetched_at: "2026-08-16T00:00:00.000Z",
          record_count: 1500,
          checksum: "deadbeef",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/meta/sources");

    expect(res.status).toBe(200);
    expect(res.body.fuentes[0].ultimosLotes[0]).toMatchObject({
      resourceId: "abc-123",
      registros: 1500,
      checksum: "deadbeef",
    });
  });
});

describe("GET /api/execution", () => {
  it("returns the ranking with traceability and applies query filters", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "001",
          nombre: "Municipalidad de Ejemplo",
          nivel_gobierno: "GOBIERNO_LOCAL",
          funcion: "Educación",
          anio_fiscal: 2025,
          pia: "1000000",
          pim: "1200000",
          devengado: "600000",
          fecha_corte: "2026-08-16",
          resource_id: "abc-123",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/execution").query({ nivel: "GOBIERNO_LOCAL", anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].avancePct).toBe(50);
    expect(res.body.resultados[0].fuente.dataset).toMatch(/MEF/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["GOBIERNO_LOCAL", 2025]);
  });
});

describe("GET /api/execution (validación de query)", () => {
  it("responde 400 cuando departamento llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/execution?departamento=a&departamento=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("responde 400 cuando anio no es un año de 4 dígitos", async () => {
    const app = createApp();
    const res = await request(app).get("/api/execution?anio=abc");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/execution/:entityCode", () => {
  it("returns 404 when the entity has no ingested data", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/execution/NOPE");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrada/);
  });

  it("includes source traceability on every timeline entry", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "001",
          nombre: "Municipalidad de Ejemplo",
          nivel_gobierno: "GOBIERNO_LOCAL",
          funcion: "Educación",
          anio_fiscal: 2025,
          pia: "1000000",
          pim: "1200000",
          devengado: "900000",
          fecha_corte: "2026-08-16",
          resource_id: "abc-123",
          fetched_at: "2026-08-16T00:00:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/execution/001");

    expect(res.status).toBe(200);
    expect(res.body.linea_de_tiempo[0].fuente).toMatchObject({ resourceId: "abc-123" });
    expect(res.body.linea_de_tiempo[0].avancePct).toBe(75);
  });
});

describe("GET /api/benchmark/:entityCode", () => {
  it("returns 404 when entity does not exist", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/NOPE");

    expect(res.status).toBe(404);
  });

  it("returns 422 when no cohort rule exists for the entity's government level", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "001", nivel_gobierno: "GOBIERNO_NACIONAL" }],
    });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/001");

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/regla de cohorte/);
  });

  it("returns a computed percentile when the cohort is sufficient", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ entity_code: "001", nivel_gobierno: "GOBIERNO_LOCAL" }] })
      .mockResolvedValueOnce({
        rows: [
          { entity_code: "001", pim: "1000", devengado: "500" },
          { entity_code: "002", pim: "1000", devengado: "900" },
          { entity_code: "003", pim: "1000", devengado: "100" },
          { entity_code: "004", pim: "1000", devengado: "700" },
          { entity_code: "005", pim: "1000", devengado: "300" },
        ],
      });

    const app = createApp();
    const res = await request(app).get("/api/benchmark/001").query({ anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.n).toBe(5);
    expect(typeof res.body.percentil).toBe("number");
  });
});
