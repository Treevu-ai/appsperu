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
  it("responde ok sin tocar la base de datos", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /readyz", () => {
  it("confirma la dependencia de base de datos antes de declararse listo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
  });

  it("no expone un error interno si la base de datos no está disponible", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(createApp()).get("/readyz");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/informes", () => {
  it("devuelve resultados con la nota de que nunca expone responsabilidad individual", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          codigo_informe: "2026CPO077500003",
          numero_informe: "035-2023-2-0775",
          entidad: "MUNICIPALIDAD DISTRITAL DE SAN MARTIN",
          sector: "GOBIERNOS LOCALES",
          nivel_gobierno: "GOBIERNO LOCAL",
          departamento: "SAN MARTIN",
          provincia: "EL DORADO",
          distrito: "SAN MARTIN",
          descripcion: "Aprobación y pago de valorizaciones...",
          modalidad_servicio: "ACCION OFICIO POSTERIOR",
          servicio_control: "SERVICIO CONTROL POSTERIOR",
          tipo_informe: null,
          periodo: 2023,
          fecha_emision: "2023-10-16",
          fecha_publicacion: "2026-05-08",
          es_con_responsabilidad: false,
          total_recomendaciones: 0,
          es_covid: false,
          es_reconstruccion: false,
          url_resumen_ejecutivo: "http://x",
          url_informe_completo: "http://y",
          updated_at: "2026-09-05T00:00:00.000Z",
        },
      ],
    });

    const res = await request(createApp()).get("/api/informes").query({ departamento: "san martin" });

    expect(res.status).toBe(200);
    expect(res.body.cobertura).toMatch(/nunca expone nombres/);
    expect(res.body.resultados[0]).toMatchObject({ codigoInforme: "2026CPO077500003", esConResponsabilidad: false });
    // Ninguna clave del resultado debe insinuar datos de funcionarios.
    expect(JSON.stringify(res.body.resultados[0])).not.toMatch(/funcionario/i);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("departamento = $1"), ["SAN MARTIN"]);
  });

  it("filtra por entidad con ILIKE parcial", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/informes").query({ entidad: "trujillo" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("entidad ILIKE $1"), ["%TRUJILLO%"]);
  });

  it("filtra por esConResponsabilidad como booleano real, no string", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/informes").query({ esConResponsabilidad: "true" });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("es_con_responsabilidad = $1"), [true]);
  });

  it("rechaza un período con formato inválido", async () => {
    const res = await request(createApp()).get("/api/informes").query({ periodo: "26" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
