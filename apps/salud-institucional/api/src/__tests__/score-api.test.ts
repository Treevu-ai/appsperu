import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const ejecucionQueryMock = vi.fn();
const infobrasQueryMock = vi.fn();
const inversionesQueryMock = vi.fn();
const comprasQueryMock = vi.fn();
const fiscalQueryMock = vi.fn();

vi.mock("../db/ejecucion-pool.js", () => ({ ejecucionPool: { query: ejecucionQueryMock } }));
vi.mock("../db/infobras-pool.js", () => ({ infobrasPool: { query: infobrasQueryMock } }));
vi.mock("../db/inversiones-pool.js", () => ({ inversionesPool: { query: inversionesQueryMock } }));
vi.mock("../db/compras-pool.js", () => ({ comprasPool: { query: comprasQueryMock } }));
vi.mock("../db/fiscal-pool.js", () => ({ fiscalPool: { query: fiscalQueryMock } }));

const { createApp } = await import("../app.js");

beforeEach(() => {
  ejecucionQueryMock.mockReset();
  infobrasQueryMock.mockReset();
  inversionesQueryMock.mockReset();
  comprasQueryMock.mockReset();
  fiscalQueryMock.mockReset();
});

function mockEmptyDownstream() {
  infobrasQueryMock.mockResolvedValueOnce({ rows: [] });
  inversionesQueryMock.mockResolvedValueOnce({ rows: [] });
  comprasQueryMock.mockResolvedValueOnce({ rows: [] });
}

describe("GET /api/score (nivel de gobierno, territorio y ranking por cohorte)", () => {
  it("expone nivelGobierno/provincia/distrito por entidad", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [
        {
          entity_code: "001", nombre: "Municipalidad de Ejemplo", nivel_gobierno: "GOBIERNOS LOCALES",
          provincia: "TRUJILLO", distrito: "TRUJILLO", pim: "100", devengado: "50",
        },
      ],
    });
    mockEmptyDownstream();

    const res = await request(createApp()).get("/api/score").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      nivelGobierno: "GOBIERNOS LOCALES",
      provincia: "TRUJILLO",
      distrito: "TRUJILLO",
    });
  });

  it("no inventa provincia/distrito cuando el territorio no resuelve", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "999", nombre: "Entidad sin territorio", nivel_gobierno: "GOBIERNO NACIONAL", provincia: null, distrito: null, pim: "100", devengado: "50" }],
    });
    mockEmptyDownstream();

    const res = await request(createApp()).get("/api/score");

    expect(res.body.resultados[0].provincia).toBeNull();
    expect(res.body.resultados[0].distrito).toBeNull();
  });

  it("calcula el ranking dentro de la cohorte de nivel de gobierno, sin contaminarse entre niveles", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [
        { entity_code: "A", nombre: "Local Alto", nivel_gobierno: "GOBIERNOS LOCALES", provincia: "TRUJILLO", distrito: "TRUJILLO", pim: "100", devengado: "90" },
        { entity_code: "B", nombre: "Local Bajo", nivel_gobierno: "GOBIERNOS LOCALES", provincia: "ASCOPE", distrito: "ASCOPE", pim: "100", devengado: "10" },
        { entity_code: "C", nombre: "Regional Unico", nivel_gobierno: "GOBIERNOS REGIONALES", provincia: "TRUJILLO", distrito: "TRUJILLO", pim: "100", devengado: "50" },
      ],
    });
    mockEmptyDownstream();

    const res = await request(createApp()).get("/api/score");

    const byCode = Object.fromEntries(res.body.resultados.map((r: { entityCode: string }) => [r.entityCode, r]));
    expect(byCode.A.rankingEnNivelGobierno).toEqual({ posicion: 1, total: 2 });
    expect(byCode.B.rankingEnNivelGobierno).toEqual({ posicion: 2, total: 2 });
    expect(byCode.C.rankingEnNivelGobierno).toEqual({ posicion: 1, total: 1 });
  });

  it("una entidad sin score (0 componentes disponibles) no recibe ranking", async () => {
    ejecucionQueryMock.mockResolvedValueOnce({
      rows: [{ entity_code: "SIN-DATO", nombre: "Sin ejecución registrada", nivel_gobierno: "GOBIERNOS LOCALES", provincia: "TRUJILLO", distrito: "TRUJILLO", pim: null, devengado: null }],
    });
    mockEmptyDownstream();

    const res = await request(createApp()).get("/api/score");

    expect(res.body.resultados[0].scoreCompuesto).toBeNull();
    expect(res.body.resultados[0].rankingEnNivelGobierno).toBeNull();
  });
});
