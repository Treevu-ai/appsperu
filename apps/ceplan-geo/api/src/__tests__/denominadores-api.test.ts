import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const fetchDenunciasByProvinciaMock = vi.fn();
const fetchEjecucionByUbigeoMock = vi.fn();

vi.mock("../lib/api-clients.js", () => ({
  fetchDenunciasByProvincia: fetchDenunciasByProvinciaMock,
  fetchEjecucionByUbigeo: fetchEjecucionByUbigeoMock,
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  fetchDenunciasByProvinciaMock.mockReset();
  fetchEjecucionByUbigeoMock.mockReset();
});

const filaLocal = (pim: number, devengado: number) => ({
  entityCode: "301127",
  nombre: "MUNICIPALIDAD DISTRITAL DE EJEMPLO",
  nivelGobierno: "GOBIERNOS LOCALES",
  funcion: "Planeamiento",
  pim,
  devengado,
  fechaCorte: "2026-08-01",
});

const filaRegional = (pim: number, devengado: number) => ({
  entityCode: "999",
  nombre: "REGION LA LIBERTAD-SEDE CENTRAL",
  nivelGobierno: "GOBIERNOS REGIONALES",
  funcion: "Planeamiento",
  pim,
  devengado,
  fechaCorte: "2026-08-01",
});

describe("GET /api/denominadores/benchmark-ejecucion", () => {
  it("calcula terciles y percentiles por avance de ejecución, excluyendo Gobierno Regional", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { ubigeo: "130101", distrito: "TRUJILLO", poblacion: "286549" },
        { ubigeo: "130102", distrito: "EL PORVENIR", poblacion: "191025" },
        { ubigeo: "130107", distrito: "MOCHE", poblacion: "29641" },
      ],
    });
    fetchEjecucionByUbigeoMock
      .mockResolvedValueOnce({
        // Trujillo: mezcla municipalidad + regional en la fuente real; solo la municipalidad debe contar.
        filasSede: [filaLocal(1000, 500), filaRegional(1_000_000, 400_000)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(2000, 1800)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(500, 100)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      });

    const res = await request(createApp()).get("/api/denominadores/benchmark-ejecucion");

    expect(res.status).toBe(200);
    const trujillo = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(trujillo).toMatchObject({ pim: 1000, devengado: 500, avancePct: 50, avancePctIndefinido: false });

    // Con 3 distritos, cada tercil tiene 1 — nadie se queda sin tier.
    const tiers = res.body.resultados.map((r: { tier: string }) => r.tier);
    expect(new Set(tiers)).toEqual(new Set(["GRANDE", "MEDIANO", "PEQUEÑO"]));
  });

  it("expone avancePctIndefinido cuando PIM es 0 con devengado real (caso Trujillo)", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { ubigeo: "130101", distrito: "TRUJILLO", poblacion: "286549" },
        { ubigeo: "130107", distrito: "MOCHE", poblacion: "29641" },
      ],
    });
    fetchEjecucionByUbigeoMock
      .mockResolvedValueOnce({
        filasSede: [filaLocal(0, 118_308_242.54)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(500, 100)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      });

    const res = await request(createApp()).get("/api/denominadores/benchmark-ejecucion");

    expect(res.status).toBe(200);
    const trujillo = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    expect(trujillo.avancePct).toBeNull();
    expect(trujillo.avancePctIndefinido).toBe(true);
    // El resto del ranking no se rompe por el caso indefinido.
    const moche = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130107");
    expect(moche.avancePct).toBe(20);
  });

  it("ordena un avancePct indefinido al final de su propio tercil, no al azar", async () => {
    // 4 distritos -> tierSize=2: los 2 más poblados comparten tercil GRANDE.
    queryMock.mockResolvedValueOnce({
      rows: [
        { ubigeo: "130101", distrito: "TRUJILLO", poblacion: "300000" },
        { ubigeo: "130102", distrito: "EL PORVENIR", poblacion: "200000" },
        { ubigeo: "130107", distrito: "MOCHE", poblacion: "50000" },
        { ubigeo: "130110", distrito: "SIMBAL", poblacion: "10000" },
      ],
    });
    fetchEjecucionByUbigeoMock
      .mockResolvedValueOnce({
        // Trujillo: PIM=0, cae en el mismo tercil que El Porvenir.
        filasSede: [filaLocal(0, 118_308_242.54)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(1000, 900)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(500, 100)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      })
      .mockResolvedValueOnce({
        filasSede: [filaLocal(200, 50)],
        filasNacionalDirigido: [],
        dependency: { app: "radar-ejecucion", url: "http://localhost:4000", ok: true },
      });

    const res = await request(createApp()).get("/api/denominadores/benchmark-ejecucion");

    expect(res.status).toBe(200);
    const trujillo = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130101");
    const elPorvenir = res.body.resultados.find((r: { ubigeo: string }) => r.ubigeo === "130102");
    expect(trujillo.tier).toBe("GRANDE");
    expect(elPorvenir.tier).toBe("GRANDE");
    expect(trujillo.tamanoTier).toBe(2);
    // El Porvenir tiene avancePct real (90) — debe rankear antes que el indefinido de Trujillo.
    expect(elPorvenir.posicionEnTier).toBe(1);
    expect(elPorvenir.percentilEnTier).toBe(100);
    expect(trujillo.posicionEnTier).toBe(2);
    expect(trujillo.percentilEnTier).toBe(0);
  });

  it("responde 502 con la dependencia cuando radar-ejecucion no responde", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ ubigeo: "130101", distrito: "TRUJILLO", poblacion: "286549" }],
    });
    const dependency = { app: "radar-ejecucion", url: "http://localhost:4000", ok: false, error: "HTTP 503" };
    fetchEjecucionByUbigeoMock.mockRejectedValue(Object.assign(new Error("HTTP 503"), { dependency }));

    const res = await request(createApp()).get("/api/denominadores/benchmark-ejecucion");

    expect(res.status).toBe(502);
    expect(res.body.dependencia).toEqual(dependency);
  });

  it("responde 404 sin llamar a radar-ejecucion cuando la provincia no tiene denominadores", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .get("/api/denominadores/benchmark-ejecucion")
      .query({ provincia: "SANCHEZ CARRION" });

    expect(res.status).toBe(404);
    expect(fetchEjecucionByUbigeoMock).not.toHaveBeenCalled();
  });
});
