import { describe, expect, it } from "vitest";
import { parseDelimitedCsv, toIntOrNull, toStrOrNull, parseDmyDate } from "../ingest/csv-util.js";

describe("parseDelimitedCsv", () => {
  it("separa filas y columnas simples por ;", () => {
    const rows = parseDelimitedCsv("a;b;c\r\n1;2;3\r\n4;5;6");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("quita el BOM UTF-8 inicial sin romper la primera celda", () => {
    const rows = parseDelimitedCsv("﻿a;b\r\n1;2");
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("respeta un salto de línea real DENTRO de comillas (el caso que motiva este parser)", () => {
    const csv = 'id;desc;x\r\n1;"línea uno\nlínea dos";9';
    const rows = parseDelimitedCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["1", "línea uno\nlínea dos", "9"]);
  });

  it("respeta comillas dobles escapadas dentro de un campo entre comillas", () => {
    const csv = 'id;nombre\r\n1;"FERIA ""TRUJILLO ES LINDO"""';
    const rows = parseDelimitedCsv(csv);
    expect(rows[1][1]).toBe('FERIA "TRUJILLO ES LINDO"');
  });

  it("descarta la línea en blanco final", () => {
    const rows = parseDelimitedCsv("a;b\r\n1;2\r\n");
    expect(rows).toHaveLength(2);
  });
});

describe("toIntOrNull / toStrOrNull", () => {
  it("trata '-' y vacío como null (no como texto/cero)", () => {
    expect(toIntOrNull("-")).toBeNull();
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull(undefined)).toBeNull();
    expect(toStrOrNull("-")).toBeNull();
    expect(toStrOrNull(" ")).toBeNull();
  });

  it("parsea valores reales", () => {
    expect(toIntOrNull(" 12 ")).toBe(12);
    expect(toStrOrNull(" CAFÉ ")).toBe("CAFÉ");
  });
});

describe("parseDmyDate", () => {
  it("parsea d/m/yyyy a yyyy-mm-dd", () => {
    expect(parseDmyDate("6/1/2025")).toBe("2025-01-06");
  });

  it("parsea d/m/yyyy hh:mm (ignora la hora)", () => {
    expect(parseDmyDate("4/02/2025 00:00")).toBe("2025-02-04");
  });

  it("devuelve null para vacío o formato irreconocible", () => {
    expect(parseDmyDate(undefined)).toBeNull();
    expect(parseDmyDate("")).toBeNull();
    expect(parseDmyDate("no es una fecha")).toBeNull();
  });
});
