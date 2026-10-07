/**
 * Tests de `getRiesgoEUDR` tras la reescritura 2026-10-07: ya no hay
 * `minam_deforestacion` sintético ni cruce por RUC (SERFOR no publica
 * titular de concesión forestal). El riesgo se calcula contando alertas
 * MINAM reales (puntos) dentro del polígono real de `geo-intersections.
 * forest_titles` — se sigue propagando el error en vez de devolver `[]`,
 * porque un `catch` que degrada a `[]` es indistinguible de "sin riesgo".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const geoQueryMock = vi.fn();
const ownQueryMock = vi.fn();

vi.mock("../db/geo-intersections-pool.js", () => ({
  geoIntersectionsPool: { query: geoQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: ownQueryMock },
}));

const { getRiesgoEUDR, RiesgoEUDRNoDisponibleError, RIESGO_EUDR_NO_DISPONIBLE } =
  await import("../routes/riesgo-eudr.js");

// Cuadrado 0,0 - 1,1 en lon/lat — suficiente para probar punto-dentro vs punto-fuera.
const POLIGONO_PRUEBA = JSON.stringify({
  type: "Polygon",
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
});

beforeEach(() => {
  geoQueryMock.mockReset();
  ownQueryMock.mockReset();
});

describe("getRiesgoEUDR — fallo de la fuente", () => {
  it("propaga el error de geo-intersections en vez de devolver lista vacía", async () => {
    geoQueryMock.mockRejectedValueOnce(new Error('relation "forest_titles" does not exist'));

    await expect(getRiesgoEUDR({ departamento: "LA LIBERTAD" })).rejects.toBeInstanceOf(
      RiesgoEUDRNoDisponibleError
    );
  });

  it("propaga el error de la fuente de alertas MINAM", async () => {
    geoQueryMock.mockResolvedValueOnce({
      rows: [{ id: 1, doc_leg: "D1", sup_sig: 100, sector: "X", geojson: POLIGONO_PRUEBA }],
    });
    ownQueryMock.mockRejectedValueOnce(new Error("boom"));

    const error = await getRiesgoEUDR({ departamento: "LA LIBERTAD" }).catch((e) => e);

    expect(error).toBeInstanceOf(RiesgoEUDRNoDisponibleError);
    expect(error.code).toBe(RIESGO_EUDR_NO_DISPONIBLE);
    expect(error.message).toMatch(/NO significa que no exista riesgo/);
  });

  it("conserva la causa original para poder diagnosticar", async () => {
    const cause = new Error("columna inexistente");
    geoQueryMock.mockRejectedValueOnce(cause);

    const error = await getRiesgoEUDR({ departamento: "LA LIBERTAD" }).catch((e) => e);

    expect(error.cause).toBe(cause);
  });
});

describe("getRiesgoEUDR — departamento no reconocido", () => {
  it("devuelve [] sin consultar nada si el nombre de departamento no mapea a UBIGEO", async () => {
    const results = await getRiesgoEUDR({ departamento: "NARNIA" });

    expect(results).toEqual([]);
    expect(geoQueryMock).not.toHaveBeenCalled();
  });
});

describe("getRiesgoEUDR — intersección real punto-en-polígono", () => {
  it("cuenta solo las alertas que caen dentro del polígono, no las de afuera", async () => {
    geoQueryMock.mockResolvedValueOnce({
      rows: [{ id: 7, doc_leg: "DOC-7", sup_sig: 500, sector: "Sector A", geojson: POLIGONO_PRUEBA }],
    });
    ownQueryMock.mockResolvedValueOnce({
      rows: [
        { longitud: 0.5, latitud: 0.5 }, // dentro
        { longitud: 0.2, latitud: 0.8 }, // dentro
        { longitud: 5, latitud: 5 }, // fuera
      ],
    });

    const [row] = await getRiesgoEUDR({ departamento: "LA LIBERTAD" });

    expect(row.tituloForestalId).toBe("7");
    expect(row.alertasDentroDelTitulo).toBe(2);
    expect(row.estadoRiesgo).toBe("MEDIO");
    expect(row.superficieHa).toBe(500);
    expect(row.sector).toBe("Sector A");
  });

  it("clasifica BAJO cuando no hay alertas dentro del polígono", async () => {
    geoQueryMock.mockResolvedValueOnce({
      rows: [{ id: 1, doc_leg: null, sup_sig: null, sector: null, geojson: POLIGONO_PRUEBA }],
    });
    ownQueryMock.mockResolvedValueOnce({ rows: [{ longitud: 5, latitud: 5 }] });

    const [row] = await getRiesgoEUDR({ departamento: "LA LIBERTAD" });

    expect(row.alertasDentroDelTitulo).toBe(0);
    expect(row.estadoRiesgo).toBe("BAJO");
    expect(row.superficieHa).toBeNull();
    expect(row.sector).toBeNull();
  });

  it("clasifica ALTO con 10 o más alertas dentro", async () => {
    geoQueryMock.mockResolvedValueOnce({
      rows: [{ id: 1, doc_leg: null, sup_sig: null, sector: null, geojson: POLIGONO_PRUEBA }],
    });
    ownQueryMock.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, () => ({ longitud: 0.5, latitud: 0.5 })),
    });

    const [row] = await getRiesgoEUDR({ departamento: "LA LIBERTAD" });

    expect(row.alertasDentroDelTitulo).toBe(10);
    expect(row.estadoRiesgo).toBe("ALTO");
  });

  it("devuelve [] si no hay títulos forestales para el departamento", async () => {
    geoQueryMock.mockResolvedValueOnce({ rows: [] });

    const results = await getRiesgoEUDR({ departamento: "LA LIBERTAD" });

    expect(results).toEqual([]);
    expect(ownQueryMock).not.toHaveBeenCalled();
  });
});
