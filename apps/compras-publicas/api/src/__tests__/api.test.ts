import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/radar-pool.js", () => ({
  radarPool: { query: vi.fn() },
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

describe("GET /readyz", () => {
  it("confirms the database dependency before declaring the service ready", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
  });

  it("does not expose an internal error when the database is unavailable", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not_ready", database: "unavailable" });
  });
});

describe("GET /api/procurement", () => {
  it("returns the list with traceability and applies the departamento filter", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ocid: "ocds-dgv273-seacev3-2026-1209-17",
          tender_id: "1240819",
          source_id: "seace_v3",
          buyer_id: "PE-CONSUCODE-1209",
          buyer_name: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
          departamento: "LA LIBERTAD",
          provincia: "SANCHEZ CARRION",
          distrito: "HUAMACHUCO",
          categoria: "goods",
          titulo: "LP-ABR-23-2026-MPSC-1",
          valor_monto: "352698.00",
          valor_moneda: "PEN",
          fecha_publicacion: "2026-08-12T16:38:00-05:00",
          tender_inicio: "2026-08-12T00:00:00-05:00",
          tender_fin: "2026-08-12T00:00:00-05:00",
          tags: ["planning", "tender"],
          fetched_at: "2026-08-16T19:20:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/procurement").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      ocid: "ocds-dgv273-seacev3-2026-1209-17",
      valorMonto: 352698,
      departamento: "LA LIBERTAD",
    });
    expect(res.body.resultados[0].fuente.dataset).toMatch(/OECE/);

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["LA LIBERTAD"]);
  });
});

describe("GET /api/procurement (validación de query)", () => {
  it("responde 400 cuando departamento llega repetido como array, sin tocar la base", async () => {
    const app = createApp();
    const res = await request(app).get("/api/procurement?departamento=a&departamento=b");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválidos/);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/procurement/:ocid", () => {
  it("returns 404 when the process was not ingested", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/procurement/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/);
  });

  it("returns the process detail with traceability", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ocid: "ocds-dgv273-seacev3-2026-1209-17",
          tender_id: "1240819",
          source_id: "seace_v3",
          buyer_id: "PE-CONSUCODE-1209",
          buyer_name: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
          departamento: "LA LIBERTAD",
          provincia: "SANCHEZ CARRION",
          distrito: "HUAMACHUCO",
          categoria: "goods",
          titulo: "LP-ABR-23-2026-MPSC-1",
          valor_monto: null,
          valor_moneda: "PEN",
          fecha_publicacion: "2026-08-12T16:38:00-05:00",
          tender_inicio: null,
          tender_fin: null,
          tags: ["planning", "tender"],
          fetched_at: "2026-08-16T19:20:00.000Z",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/procurement/ocds-dgv273-seacev3-2026-1209-17");

    expect(res.status).toBe(200);
    expect(res.body.valorMonto).toBeNull();
    expect(res.body.buyerName).toMatch(/SANCHEZ CARRION/);
  });
});
