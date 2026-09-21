import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: vi.fn() },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

const FILA_BASE = {
  dni_comun: "04003971",
  ruc_administrativo: "10040039711",
  razon_social: "BARRETO MARCELO TEODORO",
  resolucion_administrativa: "6386-2026-TCP-S4",
  admin_desde: "2026-01-01",
  admin_hasta: null,
  admin_estado: "VIGENTE",
  ruc_dni_judicial: "10040039711",
  nombre_judicial: "BARRETO MARCELO TEODORO",
  resolucion_judicial: "SENTENCIA DE FECHA 28.04.2017",
  judicial_desde: "2017-04-28",
  judicial_hasta: "2099-01-01", // vigente muy a futuro para el test
};

describe("GET /api/crossref/doble-inhabilitacion", () => {
  it("reporta 0 resultados limpio cuando no hay coincidencias (caso real del universo actual)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/doble-inhabilitacion");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 0, resultados: [] });
    expect(res.body.limitation).toMatch(/bases legales distintas/i);
  });

  it("enmascara dniComun a los últimos 3 dígitos, mismo criterio que personas-sancionadas.ts", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_BASE] });

    const res = await request(createApp()).get("/api/crossref/doble-inhabilitacion");

    expect(res.body.resultados[0].dniComunEnmascarado).toBe("***971");
    expect(res.body.resultados[0]).not.toHaveProperty("dniComun");
  });

  it("arma ambasVigentesHoy=true solo cuando ambas sanciones están vigentes según vigenteEnFecha (no solo el campo estado)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_BASE] });

    const res = await request(createApp()).get("/api/crossref/doble-inhabilitacion");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.resultados[0].ambasVigentesHoy).toBe(true);
    expect(res.body.resultados[0].administrativa.vigente).toBe(true);
    expect(res.body.resultados[0].judicial.vigente).toBe(true);
  });

  it("administrativa.vigente=false cuando estado dice VIGENTE pero el rango real ya venció (regresión: no confiar solo en `estado`)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ...FILA_BASE, admin_desde: "2020-01-01", admin_hasta: "2021-01-01", admin_estado: "VIGENTE" }],
    });

    const res = await request(createApp()).get("/api/crossref/doble-inhabilitacion");

    expect(res.body.resultados[0].administrativa.estado).toBe("VIGENTE");
    expect(res.body.resultados[0].administrativa.vigente).toBe(false);
    expect(res.body.resultados[0].ambasVigentesHoy).toBe(false);
  });

  it("ambasVigentesHoy=false cuando la sanción judicial ya venció", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...FILA_BASE, judicial_hasta: "2020-04-28" }] });

    const res = await request(createApp()).get("/api/crossref/doble-inhabilitacion");

    expect(res.body.resultados[0].judicial.vigente).toBe(false);
    expect(res.body.resultados[0].ambasVigentesHoy).toBe(false);
  });

  it("filtra por ruc completo en ambos lados del JOIN", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref/doble-inhabilitacion").query({ ruc: "10040039711" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/i\.ruc = \$1 OR ij\.ruc_dni = \$1 OR i\.dni = \$1 OR ij\.dni = \$1/);
    expect(params).toEqual(["10040039711"]);
  });

  it("filtra también por DNI de 8 dígitos (regresión: antes solo calzaba el RUC/ruc_dni completo)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref/doble-inhabilitacion").query({ ruc: "04003971" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/i\.dni = \$1 OR ij\.dni = \$1/);
    expect(params).toEqual(["04003971"]);
  });
});
