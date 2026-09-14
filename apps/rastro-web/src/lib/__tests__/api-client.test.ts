import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getIdentidadFiscalCrossref,
  getInfobrasPublicWorks,
  getProveedoresSancionadosCrossref,
  getRadarEjecucionSectorFicha,
} from "../api-client.js";

function mockFetchOnce(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getRadarEjecucionSectorFicha", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin ambito, arma la misma query regional que antes de GORE-05a (regresion)", async () => {
    const fetchMock = mockFetchOnce({});

    await getRadarEjecucionSectorFicha({ sectorId: "TRANSPORTE", anio: 2026, departamento: "LA LIBERTAD" });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/api/sectores/TRANSPORTE/ficha");
    expect(calledUrl.searchParams.get("anio")).toBe("2026");
    expect(calledUrl.searchParams.get("departamento")).toBe("LA LIBERTAD");
    expect(calledUrl.searchParams.has("ambito")).toBe(false);
  });

  it("con ambito=NACIONAL, lo agrega a la query sin requerir departamento (PV-01/GORE-05a)", async () => {
    const fetchMock = mockFetchOnce({});

    await getRadarEjecucionSectorFicha({ sectorId: "PRODUCCION", anio: 2026, ambito: "NACIONAL" });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("ambito")).toBe("NACIONAL");
    expect(calledUrl.searchParams.has("departamento")).toBe(false);
  });
});

describe("getInfobrasPublicWorks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin los params nuevos, arma la misma query que antes de GORE-06a (regresion)", async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });

    await getInfobrasPublicWorks({ departamento: "LA LIBERTAD", estado: "VIGENTE" });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("departamento")).toBe("LA LIBERTAD");
    expect(calledUrl.searchParams.get("estado")).toBe("VIGENTE");
    expect(calledUrl.searchParams.has("sectorEntidad")).toBe(false);
    expect(calledUrl.searchParams.has("diasParalizadoMin")).toBe(false);
    expect(calledUrl.searchParams.has("orderBy")).toBe(false);
  });

  it("combina sectorEntidad + diasParalizadoMin (con conParalizacion:true) + orderBy (PV-03/PV-04, GORE-06a)", async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });

    await getInfobrasPublicWorks({
      sectorEntidad: "PRODUCE",
      conParalizacion: true,
      diasParalizadoMin: 180,
      orderBy: "diasParalizado_desc",
    });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("sectorEntidad")).toBe("PRODUCE");
    expect(calledUrl.searchParams.get("conParalizacion")).toBe("true");
    expect(calledUrl.searchParams.get("diasParalizadoMin")).toBe("180");
    expect(calledUrl.searchParams.get("orderBy")).toBe("diasParalizado_desc");
  });

  it("sin sectorEntidad, es el ranking nacional (PV-04) — mismo endpoint, sin parametro extra", async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });

    await getInfobrasPublicWorks({ conParalizacion: true, diasParalizadoMin: 180, orderBy: "diasParalizado_desc" });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.has("sectorEntidad")).toBe(false);
    expect(calledUrl.searchParams.get("diasParalizadoMin")).toBe("180");
  });

  it("acepta diasParalizadoMin:0 como valor limite (el backend lo permite via .min(0))", async () => {
    const fetchMock = mockFetchOnce({ resultados: [] });

    await getInfobrasPublicWorks({ conParalizacion: true, diasParalizadoMin: 0 });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("diasParalizadoMin")).toBe("0");
  });

  it("lanza sincronicamente si diasParalizadoMin viene sin conParalizacion:true (guard local, no esperar al 400 del backend)", () => {
    const fetchMock = mockFetchOnce({ resultados: [] });

    expect(() => getInfobrasPublicWorks({ diasParalizadoMin: 180 })).toThrow(/conParalizacion/);
    expect(() => getInfobrasPublicWorks({ diasParalizadoMin: 180, conParalizacion: false })).toThrow(/conParalizacion/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getProveedoresSancionadosCrossref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("departamento=TODOS + soloInhabilitados + soloNuevos arma la query nacional (PV-05/PV-06, GORE-06c)", async () => {
    const fetchMock = mockFetchOnce({ departamento: "TODOS", resultados: [] });

    await getProveedoresSancionadosCrossref({ departamento: "TODOS", soloInhabilitados: true, soloNuevos: true });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/api/crossref");
    expect(calledUrl.searchParams.get("departamento")).toBe("TODOS");
    expect(calledUrl.searchParams.get("soloInhabilitados")).toBe("true");
    expect(calledUrl.searchParams.get("soloNuevos")).toBe("true");
  });

  it("sin params, no manda ningun query param (default regional del backend, LA LIBERTAD)", async () => {
    const fetchMock = mockFetchOnce({ departamento: "LA LIBERTAD", resultados: [] });

    await getProveedoresSancionadosCrossref({});

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.has("departamento")).toBe(false);
    expect(calledUrl.searchParams.has("soloInhabilitados")).toBe(false);
    expect(calledUrl.searchParams.has("soloNuevos")).toBe(false);
  });
});

describe("getIdentidadFiscalCrossref", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("departamento + soloIrregulares arma la query regional (CX-01 en GORE La Libertad, S3)", async () => {
    const fetchMock = mockFetchOnce({ departamento: "LA LIBERTAD", resultados: [] });

    await getIdentidadFiscalCrossref({ departamento: "LA LIBERTAD", soloIrregulares: true });

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe("/api/crossref");
    expect(calledUrl.searchParams.get("departamento")).toBe("LA LIBERTAD");
    expect(calledUrl.searchParams.get("soloIrregulares")).toBe("true");
  });

  it("sin params, no manda ningun query param (default regional del backend, LA LIBERTAD)", async () => {
    const fetchMock = mockFetchOnce({ departamento: "LA LIBERTAD", resultados: [] });

    await getIdentidadFiscalCrossref({});

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.has("departamento")).toBe(false);
    expect(calledUrl.searchParams.has("soloIrregulares")).toBe(false);
  });
});
