import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const inversionesQueryMock = vi.fn();
const infobrasQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/external-pools.js", () => ({
  inversionesPool: { query: inversionesQueryMock },
  infobrasPool: { query: infobrasQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  inversionesQueryMock.mockReset();
  infobrasQueryMock.mockReset();
});

const EMERGENCIA_QUIRUVILCA = {
  distrito: "QUIRUVILCA",
  total_emergencias: "54",
  damnificados: "130",
  viviendas_destruidas: "36",
  ultima_fecha: "2025-12-29",
};

const INVERSION_QUIRUVILCA = {
  cui: "2455742",
  distrito: "QUIRUVILCA",
  nombre: "RENOVACION DE CUNETAS Y ALCANTARILLA EN EL SISTEMA DE DRENAJE PLUVIAL",
  estado: "ACTIVO",
  monto_viable: "78094.17",
  costo_actualizado: "90566.61",
};

describe("GET /api/crossref/preparacion-riesgo", () => {
  it("responde ENRIQUECIMIENTO_NO_CONFIGURADO cuando no hay inversionesPool", async () => {
    vi.doMock("../db/external-pools.js", () => ({ inversionesPool: null, infobrasPool: null }));
    vi.resetModules();
    const { createApp: createAppSinPool } = await import("../app.js");

    const res = await request(createAppSinPool()).get("/api/crossref/preparacion-riesgo");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENRIQUECIMIENTO_NO_CONFIGURADO");

    vi.doUnmock("../db/external-pools.js");
    vi.resetModules();
  });

  it("marca sinProyectosPrevencion=true para un distrito con emergencias pero sin inversión de prevención", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ ...EMERGENCIA_QUIRUVILCA, distrito: "CHUGAY", total_emergencias: "92" }] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toHaveLength(1);
    expect(res.body.distritos[0]).toMatchObject({
      distrito: "CHUGAY",
      sinProyectosPrevencion: true,
      proyectosPrevencion: [],
      historialEmergencias: { totalEmergencias: 92 },
    });
  });

  it("une historial de emergencias con proyecto de prevención y su obra en infobras, por distrito", async () => {
    queryMock.mockResolvedValueOnce({ rows: [EMERGENCIA_QUIRUVILCA] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [INVERSION_QUIRUVILCA] });
    infobrasQueryMock.mockResolvedValueOnce({
      rows: [{ cui: "2455742", obras: "1", obras_paralizadas: "0", avance_fisico_real_promedio: null }],
    });

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toHaveLength(1);
    expect(res.body.distritos[0]).toMatchObject({
      distrito: "QUIRUVILCA",
      sinProyectosPrevencion: false,
      historialEmergencias: { totalEmergencias: 54, damnificados: 130 },
      proyectosPrevencion: [
        expect.objectContaining({ cui: "2455742", obrasInfobras: 1, obrasParalizadas: 0 }),
      ],
    });
  });

  it("incluye un distrito sin historial de emergencias si tiene proyecto de prevención (proyecto adelantado al daño)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [INVERSION_QUIRUVILCA] });
    infobrasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.distritos).toHaveLength(1);
    expect(res.body.distritos[0]).toMatchObject({
      distrito: "QUIRUVILCA",
      historialEmergencias: null,
      sinProyectosPrevencion: false,
    });
  });

  it("responde ENRIQUECIMIENTO_NO_DISPONIBLE si radar-inversiones falla en vivo (no rompe el endpoint)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [EMERGENCIA_QUIRUVILCA] });
    inversionesQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENRIQUECIMIENTO_NO_DISPONIBLE");
  });

  it("acepta peligros custom por query param, reemplazando el set default", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get(
      "/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD&peligros=SEQUIA,BAJAS TEMPERATURAS"
    );

    expect(res.status).toBe(200);
    expect(res.body.peligrosConsultados).toEqual(["SEQUIA", "BAJAS TEMPERATURAS"]);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ["LA LIBERTAD", ["SEQUIA", "BAJAS TEMPERATURAS"]]);
  });

  it("excluye el sentinel '- TODOS -' (inversión multi-distrito) de distritos/totalDistritos y lo reporta aparte", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({
      rows: [{ ...INVERSION_QUIRUVILCA, cui: "2133624", distrito: "- TODOS -", nombre: "DEFENSA RIBEREÑA RIO CHICAMA" }],
    });
    infobrasQueryMock.mockResolvedValueOnce({
      rows: [{ cui: "2133624", obras: "1", obras_paralizadas: "1", avance_fisico_real_promedio: "64.83" }],
    });

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.totalDistritos).toBe(0);
    expect(res.body.distritos).toEqual([]);
    expect(res.body.proyectosSinDistritoAsignado).toEqual([
      expect.objectContaining({ cui: "2133624", obrasInfobras: 1, obrasParalizadas: 1 }),
    ]);
  });

  it("reporta obrasInfobras/obrasParalizadas como null (no 0) cuando INFOBRAS no está configurado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [INVERSION_QUIRUVILCA] });
    vi.doMock("../db/external-pools.js", () => ({ inversionesPool: { query: inversionesQueryMock }, infobrasPool: null }));
    vi.resetModules();
    const { createApp: createAppSinInfobras } = await import("../app.js");

    const res = await request(createAppSinInfobras()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.infobrasEstado).toBe("NO_CONFIGURADO");
    expect(res.body.distritos[0].proyectosPrevencion[0]).toMatchObject({
      obrasInfobras: null,
      obrasParalizadas: null,
      avanceFisicoRealPromedio: null,
    });

    vi.doUnmock("../db/external-pools.js");
    vi.resetModules();
  });

  it("reporta obrasInfobras/obrasParalizadas como null (no 0) cuando INFOBRAS falla en vivo", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [INVERSION_QUIRUVILCA] });
    infobrasQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.infobrasEstado).toBe("NO_DISPONIBLE");
    expect(res.body.distritos[0].proyectosPrevencion[0]).toMatchObject({
      obrasInfobras: null,
      obrasParalizadas: null,
    });
  });

  it("expone matcherTerritorial y matcherProyectos por separado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    inversionesQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/preparacion-riesgo?departamento=LA LIBERTAD");

    expect(res.status).toBe(200);
    expect(res.body.matcherTerritorial).toBe("territorial_texto_distrito");
    expect(res.body.matcherProyectos).toBe("nombre_keyword");
  });
});
