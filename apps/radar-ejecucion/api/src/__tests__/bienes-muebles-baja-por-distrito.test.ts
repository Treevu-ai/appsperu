import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const poolQueryMock = vi.fn();
const identidadFiscalQueryMock = vi.fn();
const ceplanGeoQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: poolQueryMock },
}));
// Mockeado en un archivo de test aparte (no en api.test.ts) para no afectar
// otras rutas de esta misma app que ya asumen identidadFiscalPool/
// ceplanGeoPool como `null` por defecto (sin esas env vars en el proceso
// de test) — food.ts y care-services.ts también importan de este módulo.
vi.mock("../db/external-pools.js", () => ({
  infobrasPool: null,
  comprasPool: null,
  sancionesPool: null,
  identidadFiscalPool: { query: identidadFiscalQueryMock },
  ceplanGeoPool: { query: ceplanGeoQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  poolQueryMock.mockReset();
  identidadFiscalQueryMock.mockReset();
  ceplanGeoQueryMock.mockReset();
});

describe("GET /api/patrimonio/bienes-muebles-baja/por-distrito", () => {
  it("agrega bajas por distrito cruzando RUC -> ubigeo -> territorio", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { ruc_entidad: "20105266988", ejercicio: 2023, codigo_patrimonial: "P1" },
        { ruc_entidad: "20105266988", ejercicio: 2024, codigo_patrimonial: "P2" },
        { ruc_entidad: "20131365722", ejercicio: 2023, codigo_patrimonial: "P3" },
      ],
    });
    identidadFiscalQueryMock.mockResolvedValueOnce({
      rows: [
        { ruc: "20105266988", ubigeo: "200401" },
        { ruc: "20131365722", ubigeo: "150114" },
      ],
    });
    ceplanGeoQueryMock.mockResolvedValueOnce({
      rows: [
        { ubigeo: "200401", departamento: "PIURA", provincia: "SULLANA", distrito: "SULLANA" },
        { ubigeo: "150114", departamento: "LIMA", provincia: "LIMA", distrito: "LA MOLINA" },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/patrimonio/bienes-muebles-baja/por-distrito");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("OK");
    expect(res.body.resultados).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ distrito: "SULLANA", bajasCount: 2, municipalidadesCount: 1, ejercicios: [2023, 2024] }),
        expect.objectContaining({ distrito: "LA MOLINA", bajasCount: 1, municipalidadesCount: 1, ejercicios: [2023] }),
      ])
    );
  });

  it("responde ENRIQUECIMIENTO_NO_CONFIGURADO sin consultar bienes_muebles_baja cuando falta ceplanGeoPool", async () => {
    vi.resetModules();
    vi.doMock("../db/pool.js", () => ({ pool: { query: poolQueryMock } }));
    vi.doMock("../db/external-pools.js", () => ({
      infobrasPool: null,
      comprasPool: null,
      sancionesPool: null,
      identidadFiscalPool: { query: identidadFiscalQueryMock },
      ceplanGeoPool: null,
    }));
    const { createApp: createAppSinCeplan } = await import("../app.js");

    const res = await request(createAppSinCeplan()).get("/api/patrimonio/bienes-muebles-baja/por-distrito");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] });
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("excluye del agregado un RUC sin match en el padrón de identidad fiscal", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        { ruc_entidad: "20105266988", ejercicio: 2023, codigo_patrimonial: "P1" },
        { ruc_entidad: "20999999999", ejercicio: 2023, codigo_patrimonial: "P4" },
      ],
    });
    identidadFiscalQueryMock.mockResolvedValueOnce({ rows: [{ ruc: "20105266988", ubigeo: "200401" }] });
    ceplanGeoQueryMock.mockResolvedValueOnce({ rows: [{ ubigeo: "200401", departamento: "PIURA", provincia: "SULLANA", distrito: "SULLANA" }] });

    const app = createApp();
    const res = await request(app).get("/api/patrimonio/bienes-muebles-baja/por-distrito");

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0].bajasCount).toBe(1);
  });

  it("responde 400 cuando ejercicio no es un año de 4 dígitos, sin tocar ningún pool", async () => {
    const app = createApp();
    const res = await request(app).get("/api/patrimonio/bienes-muebles-baja/por-distrito?ejercicio=abc");

    expect(res.status).toBe(400);
    expect(poolQueryMock).not.toHaveBeenCalled();
    expect(identidadFiscalQueryMock).not.toHaveBeenCalled();
    expect(ceplanGeoQueryMock).not.toHaveBeenCalled();
  });
});
