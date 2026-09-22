import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const ceplanGeoQueryMock = vi.fn();
const catastroMineroQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/external-pools.js", () => ({
  ceplanGeoPool: { query: ceplanGeoQueryMock },
  catastroMineroPool: { query: catastroMineroQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  ceplanGeoQueryMock.mockReset();
  catastroMineroQueryMock.mockReset();
});

const FILA_FORESTAL = { nom_dis: "170103", total: "5", superficie: "32956.89" };
const TERRITORIO_HUEPETUHE = { ubigeo: "170103", departamento: "MADRE DE DIOS", provincia: "MANU", distrito: "HUEPETUHE" };

describe("GET /api/crossref/conflicto-uso-suelo", () => {
  it("responde ENRIQUECIMIENTO_NO_CONFIGURADO sin ceplanGeoPool", async () => {
    vi.doMock("../db/external-pools.js", () => ({ ceplanGeoPool: null, catastroMineroPool: null }));
    vi.resetModules();
    const { createApp: createAppSinPool } = await import("../app.js");

    const res = await request(createAppSinPool()).get("/api/crossref/conflicto-uso-suelo");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENRIQUECIMIENTO_NO_CONFIGURADO");

    vi.doUnmock("../db/external-pools.js");
    vi.resetModules();
  });

  it("responde lista vacía cuando no hay concesiones forestales vigentes", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toEqual([]);
    expect(ceplanGeoQueryMock).not.toHaveBeenCalled();
  });

  it("marca hayConflictoUsoSuelo=true cuando el distrito tiene concesión forestal y derecho minero titulado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_FORESTAL] });
    ceplanGeoQueryMock.mockResolvedValueOnce({ rows: [TERRITORIO_HUEPETUHE] });
    catastroMineroQueryMock.mockResolvedValueOnce({ rows: [{ distrito: "HUEPETUHE", cantidad: "190", hectareas: "32105.44" }] });

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toHaveLength(1);
    expect(res.body.distritos[0]).toMatchObject({
      distrito: "HUEPETUHE",
      concesionForestal: { totalConcesiones: 5, superficieHa: 32956.89 },
      derechoMinero: { cantidad: 190, hectareas: 32105.44 },
      hayConflictoUsoSuelo: true,
    });
  });

  it("marca hayConflictoUsoSuelo=false cuando no hay derecho minero titulado en ese distrito", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ nom_dis: "170201", total: "14", superficie: "164296.04" }] });
    ceplanGeoQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "170201", departamento: "MADRE DE DIOS", provincia: "TAHUAMANU", distrito: "IBERIA" }],
    });
    catastroMineroQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.distritos[0]).toMatchObject({ distrito: "IBERIA", derechoMinero: null, hayConflictoUsoSuelo: false });
  });

  it("filtra por departamento -- descarta distritos traducidos a otro departamento", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ nom_dis: "130101", total: "2", superficie: "500" }] });
    ceplanGeoQueryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO" }],
    });

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toEqual([]);
    expect(catastroMineroQueryMock).not.toHaveBeenCalled();
  });

  it("responde ENRIQUECIMIENTO_NO_DISPONIBLE si ceplan-geo falla en vivo (no rompe el endpoint)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_FORESTAL] });
    ceplanGeoQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENRIQUECIMIENTO_NO_DISPONIBLE");
  });

  it("no rompe el endpoint si catastro-minero falla en vivo -- devuelve derechoMinero null", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_FORESTAL] });
    ceplanGeoQueryMock.mockResolvedValueOnce({ rows: [TERRITORIO_HUEPETUHE] });
    catastroMineroQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo?departamento=MADRE DE DIOS");

    expect(res.status).toBe(200);
    expect(res.body.distritos[0]).toMatchObject({ distrito: "HUEPETUHE", derechoMinero: null, hayConflictoUsoSuelo: false });
  });

  it("usa MADRE DE DIOS como departamento default", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/conflicto-uso-suelo");

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("MADRE DE DIOS");
  });
});
