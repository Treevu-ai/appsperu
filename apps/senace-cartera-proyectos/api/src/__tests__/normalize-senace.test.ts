import { describe, expect, it } from "vitest";
import { normalizeProyectos } from "../ingest/normalize-senace.js";

describe("normalizeProyectos", () => {
  // Fila real confirmada 2026-09-21 contra JsonCarteraProyecto?q=Aprobado (ADS-04).
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      ID: 7,
      TITULAR: "AUTOPISTA DEL NORTE S.A.C",
      RUC: "20520929658",
      TITULO_PROYECTO: "PROYECTO DE REHABILITACIÓN DE LA CALZADA ACTUAL",
      UNIDAD_PROYECTO: "EVAP PROYECTO DE REHABILITACIÓN",
      TIPO: "Clasificación",
      ACTIVIDAD: "Transportes",
      FECHA_INICIO: "29/03/2019",
      ESTADO: "Aprobado",
      DESCRIPCION: "SIN DESCRIPCION",
      LONGITUD: -78.39445858,
      LATITUD: -9.37961538,
      RESOLUCION: "RD N° 00042-2020-SENACE-PE/DEIN",
      LABEL: null,
      ...overrides,
    };
  }

  it("normaliza una fila real", () => {
    const { rows, rejected } = normalizeProyectos([realRow()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toEqual({
      senaceId: 7,
      titular: "AUTOPISTA DEL NORTE S.A.C",
      ruc: "20520929658",
      tituloProyecto: "PROYECTO DE REHABILITACIÓN DE LA CALZADA ACTUAL",
      unidadProyecto: "EVAP PROYECTO DE REHABILITACIÓN",
      tipo: "Clasificación",
      actividad: "Transportes",
      fechaInicio: "2019-03-29",
      estado: "Aprobado",
      descripcion: "SIN DESCRIPCION",
      longitud: -78.39445858,
      latitud: -9.37961538,
      resolucion: "RD N° 00042-2020-SENACE-PE/DEIN",
    });
  });

  it("rechaza una fila sin ID", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ ID: null })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/ID/);
  });

  it("rechaza una fila con ID no entero", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ ID: "7" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/ID/);
  });

  it("rechaza una fila sin ESTADO, pero conserva su senaceId (para no borrarla en el stale-cleanup)", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ ESTADO: "" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/ESTADO/);
    expect(rejected[0].senaceId).toBe(7);
  });

  it("rechaza una entrada que no es un objeto (null), sin lanzar antes de llegar a rejected", () => {
    const { rows, rejected } = normalizeProyectos([null]);
    expect(rows).toEqual([]);
    expect(rejected[0]).toMatchObject({ reason: expect.stringMatching(/objeto/), senaceId: null });
  });

  it("trata una fecha con formato correcto pero fecha inexistente (31 de febrero) como null, sin rechazar la fila", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ FECHA_INICIO: "31/02/2026" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].fechaInicio).toBeNull();
  });

  it("trata un RUC inválido (no 11 dígitos) como null, sin rechazar la fila -- confirmado en vivo: 7 de 1870 filas reales no tienen RUC válido", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ RUC: "sin-ruc" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].ruc).toBeNull();
  });

  it("trata FECHA_INICIO con formato inesperado como null, sin rechazar la fila", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ FECHA_INICIO: "2019-03-29" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].fechaInicio).toBeNull();
  });

  it("trata campos opcionales ausentes (TITULAR, RESOLUCION, LONGITUD) como null, no como error", () => {
    const row = realRow();
    delete (row as Record<string, unknown>).TITULAR;
    delete (row as Record<string, unknown>).RESOLUCION;
    delete (row as Record<string, unknown>).LONGITUD;
    const { rows, rejected } = normalizeProyectos([row]);
    expect(rejected).toEqual([]);
    expect(rows[0].titular).toBeNull();
    expect(rows[0].resolucion).toBeNull();
    expect(rows[0].longitud).toBeNull();
  });

  it("no deduplica filas idénticas en memoria -- la deduplicación real ocurre por upsert en la base, no aquí", () => {
    const { rows } = normalizeProyectos([realRow(), realRow()]);
    expect(rows).toHaveLength(2);
  });
});
