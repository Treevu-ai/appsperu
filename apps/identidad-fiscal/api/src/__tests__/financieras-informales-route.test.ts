import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const seguridadQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/seguridad-pool.js", () => ({
  seguridadPool: { query: seguridadQueryMock },
}));

// app.ts monta crossref.ts, que exige COMPRAS_DATABASE_URL y
// EJECUCION_DATABASE_URL al importarse (compras-pool.ts/ejecucion-pool.ts
// lanzan si faltan) — ninguna ruta de este archivo las usa, pero el import
// de app.js sí las evalúa.
process.env.COMPRAS_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.EJECUCION_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SEGURIDAD_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  seguridadQueryMock.mockReset();
});

describe("GET /api/financieras-informales", () => {
  it("lista candidatas y filtra por departamento", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20606720760",
            razon_social: "CASA DE EMPEÑO FLASH MONEY S.A.C.",
            ubigeo: "010101",
            departamento: "AMAZONAS",
            estado_contribuyente: "ACTIVO",
            condicion_domicilio: "HABIDO",
          },
        ],
      });

    const res = await request(createApp()).get("/api/financieras-informales").query({ departamento: "amazonas" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toEqual({
      ruc: "20606720760",
      razonSocial: "CASA DE EMPEÑO FLASH MONEY S.A.C.",
      ubigeo: "010101",
      departamento: "AMAZONAS",
      estadoContribuyente: "ACTIVO",
      condicionDomicilio: "HABIDO",
    });
    // El filtro de departamento se normaliza a mayúsculas antes de llegar al SQL.
    const [, countParams] = queryMock.mock.calls[0];
    expect(countParams).toContain("AMAZONAS");
  });
});

describe("GET /api/financieras-informales/resumen-geo", () => {
  it("normaliza LIMA METROPOLITANA + REGION LIMA a LIMA antes de cruzar con las candidatas", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ departamento: "LIMA", candidatas: "78", candidatas_activas: "30" }],
    });
    seguridadQueryMock
      .mockResolvedValueOnce({
        rows: [
          { departamento: "LIMA METROPOLITANA", anio: 2026, total: "4961" },
          { departamento: "REGION LIMA", anio: 2026, total: "956" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { departamento: "LIMA METROPOLITANA", poblacion: 7822555 },
          { departamento: "REGION LIMA", poblacion: 828473 },
        ],
      });

    const res = await request(createApp()).get("/api/financieras-informales/resumen-geo");

    expect(res.status).toBe(200);
    const lima = res.body.resumen.find((r: { departamento: string }) => r.departamento === "LIMA");
    expect(lima).toBeDefined();
    expect(lima.candidatas).toBe(78);
    expect(lima.extorsionTotal).toBe(5917);
    expect(lima.poblacion).toBe(8651028);
    expect(lima.tasaExtorsion100k).toBeCloseTo(68.4, 1);
  });

  it("no combina el score en un solo número -- candidatas y tasaExtorsion100k quedan como campos separados", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ departamento: "TUMBES", candidatas: "2", candidatas_activas: "1" }],
    });
    seguridadQueryMock
      .mockResolvedValueOnce({ rows: [{ departamento: "TUMBES", anio: 2026, total: "439" }] })
      .mockResolvedValueOnce({ rows: [{ departamento: "TUMBES", poblacion: 181317 }] });

    const res = await request(createApp()).get("/api/financieras-informales/resumen-geo");

    const tumbes = res.body.resumen.find((r: { departamento: string }) => r.departamento === "TUMBES");
    expect(tumbes).toMatchObject({ candidatas: 2, candidatasActivas: 1, extorsionTotal: 439 });
    expect(tumbes).not.toHaveProperty("scoreRiesgo");
    expect(res.body.nota).toMatch(/no hay evidencia/i);
  });
});
