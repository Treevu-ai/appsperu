import { describe, expect, it } from "vitest";
import {
  buildPuertoSeriesMap,
  computeVariacionScore,
  computeVolumenScore,
  matchTerminalToPuerto,
} from "../ingest/cargas-portuarias-join.js";

const PUERTOS_REALES = [
  "Bayóvar", "Callao", "Chicama", "Chimbote", "Eten", "Huacho", "Huarmey", "Ilo", "Iquitos",
  "Matarani", "Paita", "Pisco", "Pucallpa", "Puerto Maldonado", "Salaverry", "San Nicolás",
  "Supe", "Talara", "Yurimaguas",
] as const;

describe("matchTerminalToPuerto", () => {
  it("matchea por nombre de puerto literal dentro del nombre del terminal", () => {
    expect(matchTerminalToPuerto("Bayóvar", null, PUERTOS_REALES)).toBe("Bayóvar");
    expect(matchTerminalToPuerto("Chimbote", "TP Chimbote", PUERTOS_REALES)).toBe("Chimbote");
  });

  it("matchea por el label cuando el nombre del terminal no menciona el puerto", () => {
    // caso real confirmado: nombre_terminal="Muelle MU1", label_terminal="TP Refineria Talara - Muelle MU1"
    expect(matchTerminalToPuerto("Muelle MU1", "TP Refineria Talara - Muelle MU1", PUERTOS_REALES)).toBe("Talara");
  });

  it("matchea las 3 terminales reales de Callao (nombres con paréntesis)", () => {
    expect(matchTerminalToPuerto("Callao (Terminal Multipropósito Muelle Norte )", null, PUERTOS_REALES)).toBe("Callao");
    expect(matchTerminalToPuerto("Callao (Terminal de Contenedores Muelle Sur)", null, PUERTOS_REALES)).toBe("Callao");
  });

  it("usa el override verificado cuando el nombre del operador no menciona el puerto", () => {
    // caso real: XLSX dice "TP Shougan Hierro Perú" bajo el agregado "San Nicolás"; el
    // inventario MTC 2025 lo llama "Shougang Hierro Perú" (variante ortográfica).
    expect(matchTerminalToPuerto("Shougang Hierro Perú", "TP Shougang Hierro Perú", PUERTOS_REALES)).toBe("San Nicolás");
    expect(matchTerminalToPuerto("Perú LNG Melchorita", null, PUERTOS_REALES)).toBe("Callao");
  });

  it("no fuerza un match cuando no hay evidencia (embarcadero fluvial sin puerto conocido)", () => {
    expect(matchTerminalToPuerto("A.N KERO E.I.R.L", "A.N KERO E.I.R.L", PUERTOS_REALES)).toBeNull();
  });

  it("no aplica un override para un puerto que no está en la lista disponible", () => {
    expect(matchTerminalToPuerto("Shougang Hierro Perú", null, ["Callao"])).toBeNull();
  });
});

describe("buildPuertoSeriesMap", () => {
  it("indexa volumen por puerto y año", () => {
    const map = buildPuertoSeriesMap([
      { nombreFuente: "Callao", anio: 2015, volumenTm: 100 },
      { nombreFuente: "Callao", anio: 2017, volumenTm: 200 },
      { nombreFuente: "Paita", anio: 2017, volumenTm: 50 },
    ]);
    expect(map.get("Callao")).toEqual({ 2015: 100, 2017: 200 });
    expect(map.get("Paita")).toEqual({ 2017: 50 });
    expect(map.get("Inexistente")).toBeUndefined();
  });
});

describe("computeVolumenScore", () => {
  it("null cuando no hay dato (terminal sin match en el histórico)", () => {
    expect(computeVolumenScore(null)).toBeNull();
  });

  it("clasifica por los umbrales reales de los 19 puertos del anuario 2010-2017", () => {
    expect(computeVolumenScore(54_732_718)).toBe(75); // Callao 2017
    expect(computeVolumenScore(13_663_540)).toBe(75); // San Nicolás 2017
    expect(computeVolumenScore(9_303_722)).toBe(50); // Matarani 2017
    expect(computeVolumenScore(2_110_342)).toBe(50); // Paita 2017
    expect(computeVolumenScore(653_934)).toBe(25); // Chimbote 2017
    expect(computeVolumenScore(197_694)).toBe(10); // Supe 2017
    expect(computeVolumenScore(0)).toBe(10); // Chicama 2017
  });
});

describe("computeVariacionScore", () => {
  it("null cuando falta 2015 o 2017 en la serie", () => {
    expect(computeVariacionScore(null)).toBeNull();
    expect(computeVariacionScore({ 2017: 100 })).toBeNull();
  });

  it("trata un puerto sin actividad en 2015 que aparece en 2017 como entrada en operación (score alto)", () => {
    // caso real: Pucallpa 2015=0, 2017=186577
    expect(computeVariacionScore({ 2015: 0, 2017: 186_577 })).toBe(75);
  });

  it("trata 0 a 0 como sin crecimiento (score bajo), no como match de 'entra en operación'", () => {
    expect(computeVariacionScore({ 2015: 0, 2017: 0 })).toBe(10);
  });

  it("clasifica variaciones reales por magnitud", () => {
    expect(computeVariacionScore({ 2015: 5_356_495, 2017: 9_303_722 })).toBe(75); // Matarani +73.7%
    expect(computeVariacionScore({ 2015: 11_800_583, 2017: 13_663_540 })).toBe(50); // San Nicolás +15.8%
    expect(computeVariacionScore({ 2015: 3_936_709, 2017: 3_808_283 })).toBe(25); // Talara -3.3%
    expect(computeVariacionScore({ 2015: 266_340, 2017: 197_694 })).toBe(10); // Supe -25.8%
  });
});
