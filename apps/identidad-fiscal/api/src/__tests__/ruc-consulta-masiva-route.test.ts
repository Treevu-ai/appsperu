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

const FILA_DB = {
  ruc: "20100047218",
  razon_social: "COOPERATIVA AGRARIA EJEMPLO",
  tipo_contribuyente: "SOCIEDAD COOPERATIVA",
  profesion_oficio: null,
  nombre_comercial: null,
  condicion_contribuyente: "HABIDO",
  estado_contribuyente: "ACTIVO",
  fecha_inscripcion: "1998-04-01",
  fecha_inicio_actividades: "1998-04-01",
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
  direccion: "AV. EJEMPLO 123",
  telefono: null,
  fax: null,
  actividad_comercio_exterior: "SI",
  ciiu_principal: "01132",
  ciiu_secundario_1: null,
  ciiu_secundario_2: null,
  afecto_nuevo_rus: "NO",
  buen_contribuyente: "SI",
  agente_retencion: "NO",
  agente_percepcion_venta_interna: "NO",
  agente_percepcion_combustible: "NO",
  fecha_consulta: "2026-09-19T00:00:00.000Z",
};

describe("GET /api/ruc-consulta-masiva", () => {
  it("lista contribuyentes con paginación real", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "1" }] }).mockResolvedValueOnce({ rows: [FILA_DB] });

    const res = await request(createApp()).get("/api/ruc-consulta-masiva").query({ departamento: "la libertad" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.resultados[0]).toMatchObject({
      ruc: "20100047218",
      razonSocial: "COOPERATIVA AGRARIA EJEMPLO",
      buenContribuyente: "SI",
    });
  });

  it("filtra por buenContribuyente=true generando la condición SQL esperada", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp()).get("/api/ruc-consulta-masiva").query({ buenContribuyente: "true" });
    const [sql] = queryMock.mock.calls[1];
    expect(sql).toMatch(/buen_contribuyente = 'SI'/);
  });
});

describe("GET /api/ruc-consulta-masiva/:ruc", () => {
  it("devuelve el detalle completo de un RUC", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_DB] });
    const res = await request(createApp()).get("/api/ruc-consulta-masiva/20100047218");
    expect(res.status).toBe(200);
    expect(res.body.ciiuPrincipal).toBe("01132");
  });

  it("devuelve 404 si el RUC no fue consultado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/ruc-consulta-masiva/20100047218");
    expect(res.status).toBe(404);
  });
});
