import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const fetchInversionesMock = vi.fn();
const fetchInfobrasObrasMock = vi.fn();
const fetchEjecucionByUbigeoMock = vi.fn();
const lookupTerritoryByNamesMock = vi.fn();
const getTerritoryByUbigeoMock = vi.fn();
const findNearbyInfrastructureMock = vi.fn();

vi.mock("../lib/api-clients.js", () => ({
  fetchInversiones: fetchInversionesMock,
  fetchInfobrasObras: fetchInfobrasObrasMock,
  fetchEjecucionByUbigeo: fetchEjecucionByUbigeoMock,
}));

vi.mock("../crossref/territory-lookup.js", () => ({
  lookupTerritoryByNames: lookupTerritoryByNamesMock,
  getTerritoryByUbigeo: getTerritoryByUbigeoMock,
}));

vi.mock("../crossref/nearby-infrastructure.js", () => ({
  findNearbyInfrastructure: findNearbyInfrastructureMock,
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  fetchInversionesMock.mockReset();
  fetchInfobrasObrasMock.mockReset();
  fetchEjecucionByUbigeoMock.mockReset();
  lookupTerritoryByNamesMock.mockReset();
  getTerritoryByUbigeoMock.mockReset();
  findNearbyInfrastructureMock.mockReset();
  findNearbyInfrastructureMock.mockResolvedValue([]);
});

describe("crossref routes", () => {
  it("enriches inversiones from radar-inversiones", async () => {
    fetchInversionesMock.mockResolvedValue({
      inversiones: [
        {
          cui: "2716769",
          nombre: "Carretera",
          departamento: "LA LIBERTAD",
          provincia: "TRUJILLO",
          distrito: "TRUJILLO",
          montoViable: 100,
          costoActualizado: 120,
          estado: "VIABLE",
          fuente: { extraidoEl: "2026-08-24" },
        },
      ],
      dependency: { app: "radar-inversiones", url: "http://localhost:4002", ok: true },
    });
    lookupTerritoryByNamesMock.mockResolvedValue({
      territory: {
        ubigeo: "130101",
        departamento: "LA LIBERTAD",
        provincia: "TRUJILLO",
        distrito: "TRUJILLO",
        geometryGeojson: null,
      },
      matchStatus: "confirmada",
    });

    const res = await request(createApp())
      .get("/api/crossref/inversiones")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.matcher).toBe("territorio_nombre");
    expect(res.body.resultados[0].territorio.ubigeo).toBe("130101");
  });

  it("returns 502 when radar-inversiones is down", async () => {
    const dependency = { app: "radar-inversiones", url: "http://localhost:4002", ok: false, error: "HTTP 503" };
    fetchInversionesMock.mockRejectedValue(Object.assign(new Error("HTTP 503"), { dependency }));

    const res = await request(createApp())
      .get("/api/crossref/inversiones")
      .query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(502);
    expect(res.body.cobertura).toBe("BLOQUEADA");
  });

  it("requires ubigeo for ejecucion crossref", async () => {
    const res = await request(createApp()).get("/api/crossref/ejecucion");
    expect(res.status).toBe(400);
  });

  it("enriches ejecucion by ubigeo", async () => {
    getTerritoryByUbigeoMock.mockResolvedValue({
      ubigeo: "130101",
      departamento: "LA LIBERTAD",
      provincia: "TRUJILLO",
      distrito: "TRUJILLO",
      geometryGeojson: null,
    });
    fetchEjecucionByUbigeoMock.mockResolvedValue({
      filas: [{ entityCode: "123", nombre: "MPT", nivelGobierno: "GOBIERNOS LOCALES", funcion: "Salud", pim: 1, devengado: 1, fechaCorte: "2026-08-01" }],
      dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
    });

    const res = await request(createApp()).get("/api/crossref/ejecucion").query({ ubigeo: "130101" });
    expect(res.status).toBe(200);
    expect(res.body.matcher).toBe("ubigeo_exacto");
    expect(res.body.resultados[0].ejecucion).toHaveLength(1);
  });
});
