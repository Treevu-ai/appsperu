import { describe, expect, it } from "vitest";
import { normalizeEmergencias } from "../ingest/normalize-indeci.js";

describe("normalizeEmergencias", () => {
  // Fila real confirmada 2026-09-22 contra BD_2003-2025_EMERGENCIAS.csv (ADS-05), decodificada latin1.
  function realRow(overrides: Record<number, string> = {}): string[] {
    const base = [
      "351", "11/02/2003", "2003", "FEBRERO", "010101", "AMAZONAS", "CHACHAPOYAS", "CHACHAPOYAS",
      "LLUVIA INTENSA", "ORIGEN NATURAL", "SIERRA", "0", "0", "0", "4", "0", "1", "0", "0", "0",
      "", "", "", "", "", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
      "0", "0", "0", "0", "0", "0", "0", "0", "363.24", "345.4446",
    ];
    for (const [idx, value] of Object.entries(overrides)) base[Number(idx)] = value;
    return base;
  }

  it("normaliza una fila real", () => {
    const { rows, rejected } = normalizeEmergencias([realRow()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      sinpadId: 351,
      fechaEmergencia: "2003-02-11",
      anio: 2003,
      mes: "FEBRERO",
      codDistrito: "010101",
      departamento: "AMAZONAS",
      provincia: "CHACHAPOYAS",
      distrito: "CHACHAPOYAS",
      peligro: "LLUVIA INTENSA",
      tipoPeligro: "ORIGEN NATURAL",
      regionNatural: "SIERRA",
      damnificados: 4,
      viviendasDestruidas: 1,
      viviendasAfectadas: 0,
      pesoAyuda: 363.24,
      costoAyuda: 345.4446,
    });
  });

  it("rechaza una fila con un número de columnas distinto de 49", () => {
    const { rows, rejected } = normalizeEmergencias([realRow().slice(0, 48)]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/48 columnas/);
  });

  it("parsea fechas en formato DD/MM/AAAA (el formato mayoritario, ~89.5% de las filas reales)", () => {
    const { rows } = normalizeEmergencias([realRow({ 1: "22/12/2018" })]);
    expect(rows[0].fechaEmergencia).toBe("2018-12-22");
  });

  it("parsea fechas en formato MM/DD/AA con año de 2 dígitos (hallazgo real, documentado por la propia fuente, ~10.5% de las filas)", () => {
    const { rows } = normalizeEmergencias([realRow({ 1: "02/15/25", 2: "2025" })]);
    expect(rows[0].fechaEmergencia).toBe("2025-02-15");
  });

  it("distingue los dos formatos sin ambigüedad por la longitud del año, no por heurística de rango de mes/día", () => {
    // "11/02/2003" es DD/MM/AAAA -> 11 de febrero. Si se interpretara como MM/DD/AA por error
    // (año de 4 dígitos truncado a 2), el resultado sería una fecha distinta.
    const { rows } = normalizeEmergencias([realRow({ 1: "11/02/2003" })]);
    expect(rows[0].fechaEmergencia).toBe("2003-02-11");
  });

  it("trata una fecha con formato correcto pero fecha inexistente como null, sin rechazar la fila", () => {
    const { rows, rejected } = normalizeEmergencias([realRow({ 1: "31/02/2020" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].fechaEmergencia).toBeNull();
  });

  it("trata un sinpadId no numérico como null, sin rechazar la fila (sinpadId no es la clave del registro)", () => {
    const { rows, rejected } = normalizeEmergencias([realRow({ 0: "" })]);
    expect(rejected).toEqual([]);
    expect(rows[0].sinpadId).toBeNull();
  });

  it("guarda los campos secundarios (colegios, salud, ganado) en detalleEdan cuando tienen valor", () => {
    const { rows } = normalizeEmergencias([realRow({ 18: "2", 37: "5" })]);
    expect(rows[0].detalleEdan).toMatchObject({
      "CENTROS EDUCATIVOS DESTRUIDOS": "2",
      "PERDIDA VACUNO": "5",
    });
  });

  it("no incluye campos secundarios vacíos en detalleEdan (fila real: ~53% de las filas tienen SCANT_CCEE vacío)", () => {
    const { rows } = normalizeEmergencias([realRow()]);
    expect(rows[0].detalleEdan).not.toHaveProperty("SCANT_CCEE");
  });

  it("no deduplica por sinpadId en memoria -- confirmado en vivo que no es una clave única (7 códigos repetidos entre eventos distintos)", () => {
    const { rows } = normalizeEmergencias([realRow(), realRow({ 1: "01/01/2020", 2: "2020" })]);
    expect(rows).toHaveLength(2);
  });
});
