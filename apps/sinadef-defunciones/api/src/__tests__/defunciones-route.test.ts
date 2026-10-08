import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/defunciones", () => {
  it("filtra por provincia/distrito/muerteViolenta/anio generando el WHERE esperado", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ total: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await request(createApp())
      .get("/api/defunciones")
      .query({ provincia: "pataz", distrito: "parcoy", muerteViolenta: "homicidio", anio: "2024" });

    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/provincia_domicilio = \$1/);
    expect(sql).toMatch(/distrito_domicilio = \$2/);
    expect(sql).toMatch(/muerte_violenta = \$3/);
    expect(sql).toMatch(/anio_defuncion = \$4/);
    expect(params.slice(0, 4)).toEqual(["PATAZ", "PARCOY", "HOMICIDIO", 2024]);
  });

  it("devuelve resultados mapeados a camelCase con meta de cobertura/limitación", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            provincia_domicilio: "PATAZ",
            distrito_domicilio: "PARCOY",
            sexo: "MASCULINO",
            edad: 54,
            fecha_defuncion: "2024-03-01",
            anio_defuncion: 2024,
            mes_defuncion: 3,
            tipo_lugar: "VIA PUBLICA",
            muerte_violenta: "HOMICIDIO",
            necropsia: "SI SE REALIZÓ NECROPSIA",
            causa_a: "HERIDA DE ARMA DE FUEGO",
            cie_a: "X95",
          },
        ],
      });

    const res = await request(createApp()).get("/api/defunciones");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      provincia: "PATAZ",
      distrito: "PARCOY",
      muerteViolenta: "HOMICIDIO",
      causaA: "HERIDA DE ARMA DE FUEGO",
      cieA: "X95",
    });
    expect(res.body.meta.cobertura).toBe("La Libertad únicamente");
    expect(res.body.meta.limitacion).toMatch(/desactualizado/);
  });
});

describe("GET /api/defunciones/resumen", () => {
  it("agrupa por muerte_violenta y expone la nota de no-equivalencia con SIDPOL", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { muerte_violenta: "HOMICIDIO", total: "11" },
        { muerte_violenta: "SUICIDIO", total: "2" },
      ],
    });

    const res = await request(createApp()).get("/api/defunciones/resumen").query({ provincia: "pataz" });

    expect(res.status).toBe(200);
    expect(res.body.porCategoria).toEqual([
      { muerteViolenta: "HOMICIDIO", total: 11 },
      { muerteViolenta: "SUICIDIO", total: 2 },
    ]);
    expect(res.body.meta.nota).toMatch(/no.*calificación forense/i);
  });
});
