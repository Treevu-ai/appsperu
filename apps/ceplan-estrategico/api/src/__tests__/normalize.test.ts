import { describe, expect, it } from "vitest";
import { normalizeObservaIndicadores } from "../ingest/normalize.js";
import type { ObservaCollectionRaw } from "../ingest/field-mapping.js";

function collection(indicadores: ObservaCollectionRaw["indicadores"]): ObservaCollectionRaw {
  return {
    schemaVersion: "observatorio-sye.indicadores.v1",
    coleccion: { nombre: "test", pais: "Perú", generadoEn: "2026-08-17" },
    indicadores,
  };
}

describe("normalizeObservaIndicadores", () => {
  it("aplana indicador -> series -> observaciones al modelo canónico", () => {
    const { rows, rejected } = normalizeObservaIndicadores(
      collection([
        {
          id: "gee-cumpl-02",
          codigo: "CUMP02",
          nombre: "Ejecución física del POI",
          pilar: "Gestión estratégica",
          dimension: "Ejecución y desempeño",
          subdimension: "POI - ejecución física",
          tipo: "gestion",
          unidad: { tipo: "porcentaje", simbolo: "%" },
          frecuencia: "anual",
          series: [
            {
              id: "gn",
              nombre: "Gobierno nacional",
              filtros: { nivelGobierno: "GN" },
              observaciones: [{ periodo: "2024", valor: 76.6, unidad: "%" }],
            },
          ],
        },
      ])
    );

    expect(rejected).toHaveLength(0);
    expect(rows).toEqual([
      {
        indicatorCode: "CUMP02",
        indicatorName: "Ejecución física del POI",
        serieId: "gn",
        serieLabel: "Gobierno nacional",
        nivelGobierno: "GN",
        measurementDate: "2024-01-01",
        value: 76.6,
        unitOfMeasure: "%",
        frequency: "anual",
        source: "ObservaPerú",
      },
    ]);
  });

  it("deja nivelGobierno en null cuando la serie no trae ese filtro", () => {
    const { rows } = normalizeObservaIndicadores(
      collection([
        {
          id: "gee-pn-01",
          codigo: "PN01",
          nombre: "Políticas nacionales aprobadas en el año",
          pilar: "Gestión estratégica",
          dimension: "Planeamiento y políticas",
          subdimension: "Políticas nacionales",
          tipo: "gestion",
          frecuencia: "anual",
          series: [
            {
              id: "total",
              nombre: "Total",
              filtros: { pais: "Perú" },
              observaciones: [{ periodo: "2024", valor: 4, unidad: "políticas" }],
            },
          ],
        },
      ])
    );

    expect(rows[0].nivelGobierno).toBeNull();
  });

  it("rechaza una observación con periodo que no es un año de 4 dígitos, sin descartar el resto", () => {
    const { rows, rejected } = normalizeObservaIndicadores(
      collection([
        {
          id: "x",
          codigo: "X01",
          nombre: "Indicador de prueba",
          pilar: "p",
          dimension: "d",
          subdimension: "s",
          tipo: "gestion",
          frecuencia: "anual",
          series: [
            {
              id: "total",
              nombre: "Total",
              observaciones: [
                { periodo: "no-es-un-año", valor: 10 },
                { periodo: "2024", valor: 20 },
              ],
            },
          ],
        },
      ])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(20);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/periodo no es un año/);
  });

  it("rechaza una observación con valor no numérico", () => {
    const { rows, rejected } = normalizeObservaIndicadores(
      collection([
        {
          id: "x",
          codigo: "X01",
          nombre: "Indicador de prueba",
          pilar: "p",
          dimension: "d",
          subdimension: "s",
          tipo: "gestion",
          frecuencia: "anual",
          series: [
            {
              id: "total",
              nombre: "Total",
              observaciones: [{ periodo: "2024", valor: null }],
            },
          ],
        },
      ])
    );

    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toBe("valor no numérico");
  });

  it("rechaza un indicador sin código o nombre", () => {
    const { rows, rejected } = normalizeObservaIndicadores(
      collection([
        {
          id: "x",
          codigo: "",
          nombre: "",
          pilar: "p",
          dimension: "d",
          subdimension: "s",
          tipo: "gestion",
          frecuencia: "anual",
          series: [],
        },
      ])
    );

    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toBe("indicador sin código o nombre");
  });

  it("maneja una colección vacía sin lanzar", () => {
    expect(normalizeObservaIndicadores(collection([]))).toEqual({ rows: [], rejected: [] });
  });
});
