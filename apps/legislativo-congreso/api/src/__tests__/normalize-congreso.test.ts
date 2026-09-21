import { describe, expect, it } from "vitest";
import { normalizeProyectos } from "../ingest/normalize-congreso.js";

describe("normalizeProyectos", () => {
  // Fila real confirmada 2026-09-21 contra POST /proyecto-ley/lista-con-filtro (ADS-15).
  function realRow(overrides: Record<string, unknown> = {}) {
    return {
      perParId: 2021,
      pleyNum: 14864,
      proyectoLey: "14864/2025-CR",
      desEstado: "PRESENTADO",
      fecPresentacion: "2026-07-22T00:00:00.000-05:00",
      titulo: "PROYECTO DE LEY QUE RESTITUYE LA COMPETENCIA DE LA JURISDICCIÓN ORDINARIA...",
      desProponente: "Congreso",
      autores: "Luque Ibarra, Ruth; Bazán Narro, Sigrid Tesoro",
      codTipoParl: "C",
      codTipoParlActual: "C",
      ...overrides,
    };
  }

  it("normaliza una fila real", () => {
    const { rows, rejected } = normalizeProyectos([realRow()]);
    expect(rejected).toEqual([]);
    expect(rows[0]).toEqual({
      perParId: 2021,
      pleyNum: 14864,
      proyectoLey: "14864/2025-CR",
      estado: "PRESENTADO",
      fechaPresentacion: "2026-07-22",
      titulo: "PROYECTO DE LEY QUE RESTITUYE LA COMPETENCIA DE LA JURISDICCIÓN ORDINARIA...",
      proponente: "Congreso",
      autores: "Luque Ibarra, Ruth; Bazán Narro, Sigrid Tesoro",
      codTipoParl: "C",
      codTipoParlActual: "C",
    });
  });

  it("acepta pleyNum/perParId como texto numérico además de número nativo", () => {
    const { rows } = normalizeProyectos([realRow({ perParId: "2021", pleyNum: "14864" })]);
    expect(rows[0].perParId).toBe(2021);
    expect(rows[0].pleyNum).toBe(14864);
  });

  it("rechaza una fila sin perParId", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ perParId: null })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/perParId/);
  });

  it("rechaza una fila sin pleyNum", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ pleyNum: undefined })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/pleyNum/);
  });

  it("rechaza una fila sin titulo", () => {
    const { rows, rejected } = normalizeProyectos([realRow({ titulo: "" })]);
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/titulo/);
  });

  it("trata proponente/autores/codTipoParl ausentes como null, no como error", () => {
    const row = realRow();
    delete (row as Record<string, unknown>).desProponente;
    delete (row as Record<string, unknown>).autores;
    const { rows, rejected } = normalizeProyectos([row]);
    expect(rejected).toEqual([]);
    expect(rows[0].proponente).toBeNull();
    expect(rows[0].autores).toBeNull();
  });

  it("extrae solo la parte de fecha del datetime con offset de zona horaria", () => {
    const { rows } = normalizeProyectos([realRow({ fecPresentacion: "2025-08-15T00:00:00.000-05:00" })]);
    expect(rows[0].fechaPresentacion).toBe("2025-08-15");
  });

  it("rechaza fecPresentacion con formato correcto pero fecha inexistente (30 de febrero) sin descartar la fila", () => {
    const { rows } = normalizeProyectos([realRow({ fecPresentacion: "2026-02-30T00:00:00.000-05:00" })]);
    // fechaPresentacion es opcional a nivel de fila -- una fecha inválida no descarta el
    // proyecto completo, solo queda null (a diferencia de FECHA_REPORTE en violencia-escolar,
    // que sí es obligatoria).
    expect(rows[0].fechaPresentacion).toBeNull();
  });

  it("no deduplica filas idénticas en memoria -- la deduplicación real ocurre por upsert en la base, no aquí", () => {
    const { rows } = normalizeProyectos([realRow(), realRow()]);
    expect(rows).toHaveLength(2);
  });
});
