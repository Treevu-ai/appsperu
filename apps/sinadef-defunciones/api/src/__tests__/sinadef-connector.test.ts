import { describe, expect, it } from "vitest";
import { parseSinadefLine } from "../ingest/sinadef-connector.js";

const HEADER =
  "Nº|TIPO SEGURO|SEXO|EDAD|TIEMPO EDAD|ESTADO CIVIL|NIVEL DE INSTRUCCIÓN|ETNIA|COD# UBIGEO DOMICILIO|" +
  "PAIS DOMICILIO|DEPARTAMENTO DOMICILIO|PROVINCIA DOMICILIO|DISTRITO DOMICILIO|FECHA|AÑO|MES|TIPO LUGAR|" +
  "INSTITUCION|MUERTE VIOLENTA|NECROPSIA|DEBIDO A (CAUSA A)|CAUSA A (CIE-X)|DEBIDO A (CAUSA B)|CAUSA B (CIE-X)|" +
  "DEBIDO A (CAUSA C)|CAUSA C (CIE-X)|DEBIDO A (CAUSA D)|CAUSA D (CIE-X)|DEBIDO A (CAUSA E)|CAUSA E (CIE-X)|" +
  "DEBIDO A (CAUSA F)|CAUSA F (CIE-X)";

function sampleRow(departamento: string, overrides: Partial<Record<string, string>> = {}): string {
  const base = [
    "1", "ESSALUD", "MASCULINO", "54", "AÑOS", "CASADO", "SECUNDARIA COMPLETA", "MESTIZO",
    "13-05-02-00-00-000", "PERU", departamento, "PATAZ", "PARCOY", "2019-05-25", "2019", "05",
    "EESS", "ESSALUD", "HOMICIDIO", "SI SE REALIZÓ NECROPSIA", "HERIDA DE ARMA DE FUEGO", "X95",
    "", "", "", "", "", "", "", "", "", "",
  ];
  return base.join("|");
}

describe("parseSinadefLine", () => {
  it("sanity: el header real de la fuente tiene 32 columnas", () => {
    expect(HEADER.split("|").length).toBe(32);
  });

  it("ignora la fila cuando tiene menos de 32 columnas (fila corrupta)", () => {
    expect(parseSinadefLine("1|2|3")).toBeNull();
  });

  it("filtra filas fuera de La Libertad (foco de cobertura)", () => {
    expect(parseSinadefLine(sampleRow("LIMA"))).toBeNull();
    expect(parseSinadefLine(sampleRow("CUSCO"))).toBeNull();
  });

  it("parsea correctamente una fila real de La Libertad", () => {
    const row = parseSinadefLine(sampleRow("LA LIBERTAD"));
    expect(row).not.toBeNull();
    expect(row!.departamentoDomicilio).toBe("LA LIBERTAD");
    expect(row!.provinciaDomicilio).toBe("PATAZ");
    expect(row!.distritoDomicilio).toBe("PARCOY");
    expect(row!.muerteViolenta).toBe("HOMICIDIO");
    expect(row!.causaA).toBe("HERIDA DE ARMA DE FUEGO");
    expect(row!.cieA).toBe("X95");
    expect(row!.edad).toBe(54);
    expect(row!.anio).toBe(2019);
    expect(row!.mes).toBe(5);
    expect(row!.fecha).toBe("2019-05-25");
  });

  it("convierte campos vacíos a null, no a cadena vacía", () => {
    const row = parseSinadefLine(sampleRow("LA LIBERTAD"));
    expect(row!.causaB).toBeNull();
    expect(row!.cieB).toBeNull();
  });

  it("es insensible a mayúsculas/minúsculas en el filtro de departamento", () => {
    const row = parseSinadefLine(sampleRow("la libertad"));
    expect(row).not.toBeNull();
  });
});
