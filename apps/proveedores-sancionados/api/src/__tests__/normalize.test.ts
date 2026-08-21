import { describe, expect, it } from "vitest";
import {
  isHeaderRow,
  isInhabilitacionSectionMarker,
  isMultaSectionMarker,
  isRejected,
  normalizeInhabilitacionRow,
  normalizeMultaRow,
} from "../ingest/normalize.js";

// Filas reales extraídas del export en vivo el 2026-08-20.
const REAL_INHABILITACION_ROW = [
  "1",
  "GEOMATICA CONSULTORES Y EJECUTORES S.A.C.",
  "20571603579",
  "6386-2026-TCP-S4",
  "DEFINITIVO",
  "31/07/2026",
  "",
  "",
  "TUO de la Ley N° 30225 - D.S N° 082-2019-E.F",
  "VIGENTE",
];

const REAL_MULTA_ROW = [
  "1",
  "PUMA ASOCIADOS SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA - PUMA ASOCIADOS S.R.L.",
  "20527848246",
  "1992-2026-TCP-S5",
  "27/02/2026",
  "3611558.19",
  "- b) Incumplir injustificadamente con su obligación de perfeccionar el contrato o de formalizar Acuerdos Marco.",
  "3 MESES",
  "27/08/2026",
  "27/11/2026",
  "",
  "TUO de la Ley N° 30225 - D.S N° 082-2019-E.F",
  "",
  "VIGENTE",
];

describe("normalizeInhabilitacionRow", () => {
  it("normaliza una fila real (10 columnas efectivas — la col 'Hasta' viene vacía sin <font>)", () => {
    // Nota: en el HTML real, celdas vacías sin <font> no producen entrada —
    // el connector debe rellenar con "" antes de normalizar cuando faltan
    // columnas intermedias. Este test usa el array ya completado a 10
    // posiciones (Hasta vacío) para probar el caso real observado.
    const row = [...REAL_INHABILITACION_ROW];
    // Reconstruye a 11 posiciones insertando "Hasta" vacío en índice 6.
    const withHasta = [...row.slice(0, 6), "", ...row.slice(6)];
    const result = normalizeInhabilitacionRow(withHasta);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");
    expect(result.ruc).toBe("20571603579");
    expect(result.razonSocial).toBe("GEOMATICA CONSULTORES Y EJECUTORES S.A.C.");
    expect(result.periodoInhabilitacion).toBe("DEFINITIVO");
    expect(result.desde).toBe("2026-07-31");
    expect(result.hasta).toBeNull();
    expect(result.estado).toBe("VIGENTE");
  });

  it("rechaza una fila con muy pocas columnas", () => {
    const result = normalizeInhabilitacionRow(["1", "EMPRESA X"]);
    expect(isRejected(result)).toBe(true);
  });

  it("rechaza un RUC inválido", () => {
    const row = [...REAL_INHABILITACION_ROW];
    row[2] = "123";
    const result = normalizeInhabilitacionRow(row.concat(""));
    expect(isRejected(result)).toBe(true);
  });
});

describe("normalizeMultaRow", () => {
  it("normaliza una fila real de multa", () => {
    const result = normalizeMultaRow(REAL_MULTA_ROW);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");
    expect(result.ruc).toBe("20527848246");
    expect(result.montoMulta).toBe(3611558.19);
    expect(result.fechaResolucion).toBe("2026-02-27");
    expect(result.periodoSuspension).toBe("3 MESES");
    expect(result.desde).toBe("2026-08-27");
    expect(result.norma).toMatch(/TUO de la Ley/);
  });

  it("convierte monto vacío a null en vez de 0 — nunca inventar un monto", () => {
    const row = [...REAL_MULTA_ROW];
    row[5] = "";
    const result = normalizeMultaRow(row);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");
    expect(result.montoMulta).toBeNull();
  });
});

describe("detección de secciones y encabezados", () => {
  it("reconoce el encabezado de inhabilitaciones", () => {
    expect(
      isInhabilitacionSectionMarker(["#", "Razon Social", "RUC", "Resolución", "Periodo de Inhabilitación"])
    ).toBe(true);
  });

  it("reconoce el encabezado de multas", () => {
    expect(isMultaSectionMarker(["#", "Razon Social", "RUC", "Resolución", "Monto de Multa (Soles)"])).toBe(true);
  });

  it("reconoce una fila de encabezado genérica (para saltarla al parsear)", () => {
    expect(isHeaderRow(["#", "Razon Social", "RUC"])).toBe(true);
    expect(isHeaderRow(REAL_INHABILITACION_ROW)).toBe(false);
  });
});
