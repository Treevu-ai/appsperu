import { describe, expect, it } from "vitest";
import {
  computeTbmlScoresByAduana,
  computeTbmlScore,
  matchTerminalToAduana,
  UMBRAL_DESVIACION,
  MIN_ADUANAS_PARA_MEDIANA,
  type ImportRow,
} from "../ingest/aduanas-tbml-join.js";

function fila(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    aduanaCode: 1,
    aduanaName: "MARITIMA DEL CALLAO",
    year: 2023,
    subpartida: "0101.21.00",
    fobUsd: 100_000,
    cifUsd: 110_000, // ratio 1.10, "normal"
    ...overrides,
  };
}

describe("computeTbmlScoresByAduana", () => {
  it("no marca nada anómalo cuando todas las aduanas tienen la misma razón CIF/FOB", () => {
    const rows = [
      fila({ aduanaName: "CALLAO", fobUsd: 100_000, cifUsd: 110_000 }),
      fila({ aduanaName: "PAITA_SIM", fobUsd: 50_000, cifUsd: 55_000 }),
      fila({ aduanaName: "ILO_SIM", fobUsd: 20_000, cifUsd: 22_000 }),
    ];
    const resultado = computeTbmlScoresByAduana(rows);
    for (const score of resultado.values()) {
      expect(score.pctValorAnomalo).toBe(0);
    }
  });

  it("marca como anómala la fila cuya razón CIF/FOB se desvía más del umbral de la mediana", () => {
    // Mediana de las 3: ratio 1.10 (dos normales) vs. 2.0 (la rara) → mediana = 1.10.
    // La rara se desvía (2.0-1.10)/1.10 = 0.818 >> 0.20 → anómala.
    const rows = [
      fila({ aduanaName: "CALLAO", fobUsd: 100_000, cifUsd: 110_000 }),
      fila({ aduanaName: "PAITA_SIM", fobUsd: 50_000, cifUsd: 55_000 }),
      fila({ aduanaName: "RARA_SIM", fobUsd: 10_000, cifUsd: 20_000 }),
    ];
    const resultado = computeTbmlScoresByAduana(rows);

    expect(resultado.get("RARA_SIM")?.pctValorAnomalo).toBe(1); // su única fila es anómala
    expect(resultado.get("CALLAO")?.pctValorAnomalo).toBe(0);
    expect(resultado.get("PAITA_SIM")?.pctValorAnomalo).toBe(0);
  });

  it(`no calcula mediana con menos de ${MIN_ADUANAS_PARA_MEDIANA} aduanas reportando la subpartida — esas filas no cuentan ni a favor ni en contra`, () => {
    const rows = [
      fila({ aduanaName: "CALLAO", fobUsd: 100_000, cifUsd: 999_000 }), // ratio disparatada
      fila({ aduanaName: "PAITA_SIM", fobUsd: 50_000, cifUsd: 55_000 }),
    ];
    const resultado = computeTbmlScoresByAduana(rows);
    // Solo 2 aduanas reportan esta subpartida (< MIN_ADUANAS_PARA_MEDIANA): sin benchmark,
    // ninguna fila se evalúa, así que no aparecen en el resultado.
    expect(resultado.size).toBe(0);
  });

  it("agrega por valor FOB, no por conteo de filas — una fila grande anómala pesa más que varias chicas normales", () => {
    const rows = [
      fila({ aduanaName: "MIXTA", subpartida: "A", fobUsd: 10, cifUsd: 11 }), // normal, chica
      fila({ aduanaName: "MIXTA", subpartida: "B", fobUsd: 1_000_000, cifUsd: 2_000_000 }), // anómala, enorme
      fila({ aduanaName: "REF1", subpartida: "A", fobUsd: 10, cifUsd: 11 }),
      fila({ aduanaName: "REF2", subpartida: "A", fobUsd: 10, cifUsd: 11 }),
      fila({ aduanaName: "REF1", subpartida: "B", fobUsd: 10, cifUsd: 11 }),
      fila({ aduanaName: "REF2", subpartida: "B", fobUsd: 10, cifUsd: 11 }),
    ];
    const resultado = computeTbmlScoresByAduana(rows);
    const mixta = resultado.get("MIXTA")!;
    // fobTotal = 10 + 1_000_000; fobAnomalo = 1_000_000 (solo la fila B)
    expect(mixta.pctValorAnomalo).toBeCloseTo(1_000_000 / 1_000_010, 5);
  });

  it("ignora filas con FOB cero o negativo (ratio indefinida)", () => {
    const rows = [
      fila({ aduanaName: "CERO", fobUsd: 0, cifUsd: 100 }),
      fila({ aduanaName: "REF1", fobUsd: 10, cifUsd: 11 }),
      fila({ aduanaName: "REF2", fobUsd: 10, cifUsd: 11 }),
      fila({ aduanaName: "REF3", fobUsd: 10, cifUsd: 11 }),
    ];
    const resultado = computeTbmlScoresByAduana(rows);
    expect(resultado.has("CERO")).toBe(false);
  });
});

describe("computeTbmlScore", () => {
  it("convierte pctValorAnomalo (0-1) a escala 0-100", () => {
    expect(computeTbmlScore({ aduanaName: "X", pctValorAnomalo: 0.35, filasAnomalas: 1, filasTotal: 4, fobTotal: 100 })).toBe(35);
  });

  it("retorna null si no hay match (score nulo)", () => {
    expect(computeTbmlScore(null)).toBeNull();
  });

  it("retorna null si la aduana no tiene filas evaluadas", () => {
    expect(computeTbmlScore({ aduanaName: "X", pctValorAnomalo: 0, filasAnomalas: 0, filasTotal: 0, fobTotal: 0 })).toBeNull();
  });
});

describe("matchTerminalToAduana", () => {
  const aduanasDisponibles = ["MARITIMA DEL CALLAO", "MOLLENDO - MATARANI", "PISCO", "ILO", "TACNA", "DESAGUADERO"];

  it("matchea 'Callao' contra 'MARITIMA DEL CALLAO' vía override", () => {
    expect(matchTerminalToAduana("Terminal Portuario del Callao", null, aduanasDisponibles)).toBe("MARITIMA DEL CALLAO");
  });

  it("matchea 'Matarani' contra 'MOLLENDO - MATARANI' vía override", () => {
    expect(matchTerminalToAduana("Terminal Portuario Matarani", null, aduanasDisponibles)).toBe("MOLLENDO - MATARANI");
  });

  it("matchea por palabra completa cuando el nombre del terminal contiene el de la aduana", () => {
    expect(matchTerminalToAduana("Terminal Portuario General San Martín - Pisco", null, aduanasDisponibles)).toBe("PISCO");
  });

  it("excluye aduanas no portuarias (pasos de frontera) aunque el nombre calzara por substring", () => {
    expect(matchTerminalToAduana("Terminal Tacna", null, aduanasDisponibles)).toBeNull();
  });

  it("retorna null sin forzar un match cuando no hay evidencia", () => {
    expect(matchTerminalToAduana("Embarcadero Santa Rosa", null, aduanasDisponibles)).toBeNull();
  });

  it("matchea terminales de la bahía del Callao que no mencionan 'Callao' en su nombre, vía override", () => {
    // Mismo patrón que resuelve cargas-portuarias-join.ts para el join APN — hallazgo real
    // verificado en vivo 2026-10-05: sin este override, 10 de los 23 terminales con cobertura
    // TBML quedaban sin match pese a estar en la jurisdicción de MARITIMA DEL CALLAO.
    expect(matchTerminalToAduana("Multiboyas TRALSA", null, aduanasDisponibles)).toBe("MARITIMA DEL CALLAO");
    expect(matchTerminalToAduana("Multiboyas Conchán", null, aduanasDisponibles)).toBe("MARITIMA DEL CALLAO");
    expect(
      matchTerminalToAduana("Refinería La Pampilla S.A.A. (Amarradero Multiboyas 1)", null, aduanasDisponibles)
    ).toBe("MARITIMA DEL CALLAO");
  });

  it("matchea 'Multipropósito de Chancay' contra la aduana CHANCAY (no contra Callao)", () => {
    // Chancay es una bahía administrativa del Callao para APN (ver override de
    // cargas-portuarias-join.ts), pero SUNAT la trata como aduana propia — el nombre del
    // terminal sí menciona "Chancay" literalmente, así que debe matchear por palabra completa
    // a CHANCAY, no caer en el alias genérico de Callao.
    const conChancay = [...aduanasDisponibles, "CHANCAY"];
    expect(matchTerminalToAduana("Multipropósito de Chancay", null, conChancay)).toBe("CHANCAY");
  });
});

describe("constantes documentadas", () => {
  it("UMBRAL_DESVIACION es 0.20 (elección propia del índice, FATF no fija un número)", () => {
    expect(UMBRAL_DESVIACION).toBe(0.2);
  });
});
