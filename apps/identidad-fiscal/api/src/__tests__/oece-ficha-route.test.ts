import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

// app.ts monta crossref.ts, que exige COMPRAS_DATABASE_URL y
// EJECUCION_DATABASE_URL al importarse (compras-pool.ts/ejecucion-pool.ts
// lanzan si faltan) — ninguna ruta de este archivo las usa, pero el import
// de app.js sí las evalúa.
process.env.COMPRAS_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.EJECUCION_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/oece-ficha", () => {
  it("filtra por inscritoRnp=true generando la condición SQL esperada", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/oece-ficha").query({ inscritoRnp: "true" });
    const [sql] = queryMock.mock.calls[1];
    expect(sql).toMatch(/codigo_registro IS NOT NULL/);
  });

  it("expone inscritoRnp derivado de codigo_registro en la lista", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20404057805",
            razon_social: "ACOPAGRO",
            tipo_empresa: "COOPERATIVA",
            estado_sunat: "ACTIVO",
            condicion_sunat: "HABIDO",
            departamento: "SAN MARTIN",
            provincia: "HUALLAGA",
            distrito: "SAPOSOA",
            telefono: null,
            email: null,
            codigo_registro: "S0631562",
            fecha_consulta: "2026-09-20T00:00:00.000Z",
          },
        ],
      });
    const res = await request(createApp()).get("/api/oece-ficha");
    expect(res.body.resultados[0].inscritoRnp).toBe(true);
  });
});

describe("GET /api/oece-ficha/:ruc", () => {
  it("incluye las personas (representantes/órganos/socios) del RUC", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20404057805",
            razon_social: "ACOPAGRO",
            tipo_empresa: "COOPERATIVA",
            estado_sunat: "ACTIVO",
            condicion_sunat: "HABIDO",
            departamento: "SAN MARTIN",
            provincia: "HUALLAGA",
            distrito: "SAPOSOA",
            telefono: "042-123456",
            email: "contacto@acopagro.pe",
            codigo_registro: "S0631562",
            fecha_consulta: "2026-09-20T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            rol: "REPRESENTANTE",
            source_id: "2885791",
            dni: "22999374",
            nombre: "RIOS NUÑEZ SEGUNDO GONZALO",
            tipo_organo: null,
            cargo: null,
            fecha_ingreso: "1997-07-22",
          },
        ],
      });

    const res = await request(createApp()).get("/api/oece-ficha/20404057805");

    expect(res.status).toBe(200);
    expect(res.body.inscritoRnp).toBe(true);
    expect(res.body.personas).toHaveLength(1);
    expect(res.body.personas[0]).toMatchObject({ rol: "REPRESENTANTE", dni: "22999374", sourceId: 2885791 });
  });

  it("devuelve 404 si el RUC no fue consultado contra OECE", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/oece-ficha/20404057805");
    expect(res.status).toBe(404);
  });
});
