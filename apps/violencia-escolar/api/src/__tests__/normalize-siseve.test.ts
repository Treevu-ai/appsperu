import { describe, expect, it } from "vitest";
import { normalizeCasos } from "../ingest/normalize-siseve.js";

describe("normalizeCasos", () => {
  // Fila real confirmada 2026-09-21 contra el Excel público de SíseVe.
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      FECHA_REPORTE: new Date("2026-08-31T00:00:00.000Z"),
      DRE: "DRE Lima Metropolitana",
      UGEL: "UGEL 07 San Borja",
      NIVEL_EDUCATIVO: "Secundaria",
      TIPO_REPORTE: "Personal IE a Escolares",
      TIPO_VIOLENCIA: "Psicológica",
      SUBTIPO_VIOLENCIA: "Trato humillante",
      TIPO_ESTADO_REPORTE: "Pendiente de atención por la IE",
      ...overrides,
    };
  }

  it("normaliza una fila real (fecha nativa de Excel)", () => {
    const { rows, rejected } = normalizeCasos([realRow()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toEqual({
      fechaReporte: "2026-08-31",
      dre: "DRE Lima Metropolitana",
      ugel: "UGEL 07 San Borja",
      nivelEducativo: "Secundaria",
      tipoReporte: "Personal IE a Escolares",
      tipoViolencia: "Psicológica",
      subtipoViolencia: "Trato humillante",
      tipoEstadoReporte: "Pendiente de atención por la IE",
    });
  });

  it("acepta FECHA_REPORTE como texto ISO además de Date nativo", () => {
    const { rows } = normalizeCasos([realRow({ FECHA_REPORTE: "2026-08-31" })]);
    expect(rows[0].fechaReporte).toBe("2026-08-31");
  });

  it("no deduplica filas idénticas -- cada una es un caso real distinto sin ID en la fuente", () => {
    const { rows } = normalizeCasos([realRow(), realRow()]);
    expect(rows).toHaveLength(2);
  });

  it("rechaza una fila sin FECHA_REPORTE", () => {
    const { rows, rejected } = normalizeCasos([realRow({ FECHA_REPORTE: null })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/FECHA_REPORTE/);
  });

  it("rechaza una fila sin DRE", () => {
    const { rows, rejected } = normalizeCasos([realRow({ DRE: "" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/DRE/);
  });

  it("rechaza una fila sin TIPO_VIOLENCIA", () => {
    const { rows, rejected } = normalizeCasos([realRow({ TIPO_VIOLENCIA: null })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/TIPO_VIOLENCIA/);
  });

  it("trata NIVEL_EDUCATIVO/SUBTIPO_VIOLENCIA/TIPO_ESTADO_REPORTE ausentes como null, no como error", () => {
    const row = realRow();
    delete (row as Record<string, unknown>).NIVEL_EDUCATIVO;
    delete (row as Record<string, unknown>).SUBTIPO_VIOLENCIA;
    const { rows, rejected } = normalizeCasos([row]);
    expect(rejected).toEqual([]);
    expect(rows[0].nivelEducativo).toBeNull();
    expect(rows[0].subtipoViolencia).toBeNull();
  });

  it("rechaza una FECHA_REPORTE con formato correcto pero fecha inexistente (30 de febrero)", () => {
    const { rows, rejected } = normalizeCasos([realRow({ FECHA_REPORTE: "2026-02-30" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/FECHA_REPORTE/);
  });
});
