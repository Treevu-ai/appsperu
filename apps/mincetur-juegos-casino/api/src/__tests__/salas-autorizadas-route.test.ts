import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const identidadFiscalQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/identidad-fiscal-pool.js", () => ({
  identidadFiscalPool: { query: identidadFiscalQueryMock },
}));

process.env.IDENTIDAD_FISCAL_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  identidadFiscalQueryMock.mockReset();
});

describe("GET /api/salas-autorizadas", () => {
  it("lista salas y filtra por departamento", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigo_sala: "142368004",
            ruc: "20605436022",
            empresa: "INVERSIONES MEGA GAMING SAC",
            establecimiento: "SAN JUAN II",
            giro: null,
            resolucion: "5789 - 2025",
            fecha_vigencia: "2029-08-14",
            direccion: "AV. SAN MARTIN MZ. K-1 LT. 27 - 28",
            distrito: "SAN JUAN DE LURIGANCHO",
            provincia: "LIMA",
            departamento: "LIMA",
            fecha_corte: "2026-10-01",
          },
        ],
      });

    const res = await request(createApp()).get("/api/salas-autorizadas").query({ departamento: "lima" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ codigoSala: "142368004", ruc: "20605436022" });
    const [, countParams] = queryMock.mock.calls[0];
    expect(countParams).toContain("LIMA");
  });
});

describe("GET /api/salas-autorizadas/irregulares-sunat", () => {
  it("cruza por RUC y devuelve solo los operadores que no estan ACTIVO+HABIDO en SUNAT", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20605436022" }, { ruc: "20111111111" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            codigo_sala: "142368004",
            ruc: "20605436022",
            empresa: "INVERSIONES MEGA GAMING SAC",
            establecimiento: "SAN JUAN II",
            direccion: "AV. SAN MARTIN MZ. K-1 LT. 27 - 28",
            distrito: "SAN JUAN DE LURIGANCHO",
            provincia: "LIMA",
            departamento: "LIMA",
            fecha_vigencia: "2029-08-14",
          },
        ],
      });
    identidadFiscalQueryMock.mockResolvedValueOnce({
      rows: [
        {
          ruc: "20605436022",
          razon_social: "INVERSIONES MEGA GAMING SAC",
          estado_contribuyente: "BAJA DEFINITIVA",
          condicion_domicilio: "HABIDO",
        },
      ],
    });

    const res = await request(createApp()).get("/api/salas-autorizadas/irregulares-sunat");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.resultados[0]).toMatchObject({
      ruc: "20605436022",
      estadoContribuyente: "BAJA DEFINITIVA",
    });
    expect(res.body.nota).toMatch(/no implica automáticamente/i);
  });

  it("devuelve vacio sin consultar SUNAT cuando no hay salas registradas", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/salas-autorizadas/irregulares-sunat");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, resultados: [] });
    expect(identidadFiscalQueryMock).not.toHaveBeenCalled();
  });
});
