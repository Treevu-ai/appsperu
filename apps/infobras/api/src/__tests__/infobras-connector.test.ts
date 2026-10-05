import { describe, expect, it, vi } from "vitest";
import { COL } from "../ingest/columns.js";
import { normalizeInfobrasRows } from "../ingest/normalize.js";

vi.mock("../db/pool.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../db/ejecucion-pool.js", () => ({ ejecucionPool: { query: vi.fn() } }));

const {
  canonicalizarDepartamentoFuente,
  normalizeDepartamentoScope,
  corregirGeografiaFuente,
  construirFilasCanonicas,
} = await import("../ingest/infobras-connector.js");

describe("canonicalizarDepartamentoFuente", () => {
  it('mapea el alias real de la fuente "P C DEL CALLAO" al nombre canónico CALLAO', () => {
    expect(canonicalizarDepartamentoFuente("P C DEL CALLAO")).toBe("CALLAO");
  });

  it("es insensible a mayúsculas/minúsculas y a espacios extra en el alias", () => {
    expect(canonicalizarDepartamentoFuente("  p c del callao  ")).toBe("CALLAO");
  });

  it("deja pasar sin cambios un departamento que ya viene en su forma canónica", () => {
    expect(canonicalizarDepartamentoFuente("LA LIBERTAD")).toBe("LA LIBERTAD");
  });

  it("normaliza mayúsculas y recorta espacios incluso sin alias registrado", () => {
    expect(canonicalizarDepartamentoFuente("  cusco ")).toBe("CUSCO");
  });

  it("trata un valor vacío o indefinido como cadena vacía, sin lanzar", () => {
    expect(canonicalizarDepartamentoFuente(undefined)).toBe("");
    expect(canonicalizarDepartamentoFuente("")).toBe("");
  });
});

describe("corregirGeografiaFuente", () => {
  it("reclasifica las 4 provincias de Ica etiquetadas como Huancavelica (DQ-19), sin tocar distrito", () => {
    expect(corregirGeografiaFuente("HUANCAVELICA", "CHINCHA", "CHINCHA ALTA")).toEqual({
      departamento: "ICA", provincia: "CHINCHA", distrito: "CHINCHA ALTA",
    });
    expect(corregirGeografiaFuente("HUANCAVELICA", "PISCO", "HUMAY")).toEqual({
      departamento: "ICA", provincia: "PISCO", distrito: "HUMAY",
    });
    expect(corregirGeografiaFuente("HUANCAVELICA", "PALPA", "RIO GRANDE")).toEqual({
      departamento: "ICA", provincia: "PALPA", distrito: "RIO GRANDE",
    });
  });

  it('normaliza "NAZCA" a la grafía oficial "NASCA" al reclasificar a Ica', () => {
    expect(corregirGeografiaFuente("HUANCAVELICA", "NAZCA", "CHANGUILLO")).toEqual({
      departamento: "ICA", provincia: "NASCA", distrito: "CHANGUILLO",
    });
    expect(corregirGeografiaFuente("HUANCAVELICA", "NASCA", "CHANGUILLO")).toEqual({
      departamento: "ICA", provincia: "NASCA", distrito: "CHANGUILLO",
    });
  });

  it("corrige la provincia corrupta ANDAHUAYLAS a HUAYLAS dentro de Áncash, sin tocar el departamento ni un distrito ya correcto", () => {
    expect(corregirGeografiaFuente("ANCASH", "ANDAHUAYLAS", "PUEBLO LIBRE")).toEqual({
      departamento: "ANCASH", provincia: "HUAYLAS", distrito: "PUEBLO LIBRE",
    });
  });

  it("corrige también el distrito cuando repite el mismo valor corrupto ANDAHUAYLAS (la fila 515438)", () => {
    // nombre_obra de esa fila confirma "...DISTRITO DE HUAYLAS HUAYLAS ANCASH":
    // dejar el distrito en ANDAHUAYLAS sería una corrección a medias.
    expect(corregirGeografiaFuente("ANCASH", "ANDAHUAYLAS", "ANDAHUAYLAS")).toEqual({
      departamento: "ANCASH", provincia: "HUAYLAS", distrito: "HUAYLAS",
    });
  });

  it("no toca ANDAHUAYLAS cuando el departamento declarado ya es APURIMAC (ahí sí es la provincia real)", () => {
    expect(corregirGeografiaFuente("APURIMAC", "ANDAHUAYLAS", "ANDAHUAYLAS")).toBeNull();
  });

  it("devuelve null para departamento/provincia sin corrección conocida", () => {
    expect(corregirGeografiaFuente("LA LIBERTAD", "TRUJILLO", "TRUJILLO")).toBeNull();
    expect(corregirGeografiaFuente("HUANCAVELICA", "TAYACAJA", "PAMPAS")).toBeNull();
  });
});

describe("normalizeDepartamentoScope", () => {
  it("acepta CALLAO como departamento válido del catálogo territorial (CT-06)", () => {
    expect(normalizeDepartamentoScope(undefined, ["CALLAO"])).toEqual(["CALLAO"]);
  });

  it("rechaza el alias crudo de la fuente porque el scope solo acepta nombres canónicos", () => {
    expect(() => normalizeDepartamentoScope(undefined, ["P C DEL CALLAO"])).toThrow(
      /fuera del catálogo territorial/
    );
  });
});

/**
 * Fila cruda mínima (array disperso, como la que devuelve `readInfobrasRows`)
 * con los campos requeridos por `normalizeInfobrasRows` más los de
 * geografía. Hallazgo de code review (CodeRabbit + Copilot en PR #237): los
 * tests de `corregirGeografiaFuente` aislada no probaban que la corrección
 * ocurriera antes del filtro de scope y antes de `distritoEsSospechoso` —
 * un cambio de orden en `ingestInfobrasPublicWorks` podía romper eso sin que
 * ningún test existente lo notara.
 */
function filaCruda(departamento: string, provincia: string, distrito: string, nombreObra: string): string[] {
  const row: string[] = new Array(COL.montoDevengadoTotal + 1).fill("");
  row[COL.codigoInfobras] = "OBR-TEST-001";
  row[COL.codigoEntidad] = "ENT-001";
  row[COL.entidadNombre] = "Municipalidad de prueba";
  row[COL.nombreObra] = nombreObra;
  row[COL.departamento] = departamento;
  row[COL.provincia] = provincia;
  row[COL.distrito] = distrito;
  return row;
}

describe("pipeline real: corrección → filtro de scope → normalización", () => {
  it("una fila de Ica declarada como Huancavelica cuenta para el scope ICA, no HUANCAVELICA", () => {
    const allRows = construirFilasCanonicas([
      filaCruda("HUANCAVELICA", "CHINCHA", "CHINCHA ALTA", "MEJORAMIENTO DE LA VIA EN CHINCHA ALTA"),
    ]);

    const soloIca = new Set(normalizeDepartamentoScope(undefined, ["ICA"]));
    const filtradoIca = allRows.filter((r) => soloIca.has((r[COL.departamento] ?? "").toUpperCase().trim()));
    expect(filtradoIca).toHaveLength(1);

    const soloHuancavelica = new Set(normalizeDepartamentoScope(undefined, ["HUANCAVELICA"]));
    const filtradoHuancavelica = allRows.filter((r) =>
      soloHuancavelica.has((r[COL.departamento] ?? "").toUpperCase().trim())
    );
    expect(filtradoHuancavelica).toHaveLength(0);

    const { rows } = normalizeInfobrasRows(filtradoIca);
    expect(rows[0].departamento).toBe("ICA");
    expect(rows[0].provincia).toBe("CHINCHA");
    // CHINCHA ALTA es un distrito real de la provincia CHINCHA (Ica): la
    // bandera debe recalcularse contra el catálogo de ICA, no el de
    // HUANCAVELICA (donde CHINCHA ALTA no existiría como distrito válido).
    expect(rows[0].distritoSospechoso).toBe(false);
  });

  it("la fila corregida de Ancash/Huaylas se normaliza con provincia y distrito ya corregidos", () => {
    const allRows = construirFilasCanonicas([
      filaCruda("ANCASH", "ANDAHUAYLAS", "ANDAHUAYLAS", "MEJORAMIENTO DE DEFENSAS DISTRITO DE HUAYLAS HUAYLAS ANCASH"),
    ]);

    const { rows } = normalizeInfobrasRows(allRows);
    expect(rows[0].departamento).toBe("ANCASH");
    expect(rows[0].provincia).toBe("HUAYLAS");
    expect(rows[0].distrito).toBe("HUAYLAS");
    // HUAYLAS es un distrito real de Áncash: con la corrección aplicada,
    // ya no debería quedar marcada sospechosa.
    expect(rows[0].distritoSospechoso).toBe(false);
  });
});
