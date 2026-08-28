import { describe, expect, it } from "vitest";
import { parseGisFeature, parseIdDepartamento, type GisRawFeature } from "../ingest/gis-normalize.js";

describe("parseIdDepartamento", () => {
  it("retorna [] para null o undefined", () => {
    expect(parseIdDepartamento(null)).toEqual([]);
    expect(parseIdDepartamento(undefined)).toEqual([]);
  });

  it("retorna [] para cadena vacía", () => {
    expect(parseIdDepartamento("")).toEqual([]);
  });

  it("parsea un código simple", () => {
    expect(parseIdDepartamento("13")).toEqual(["13"]);
  });

  it("parsea una lista separada por comas (proyecto multi-región)", () => {
    expect(parseIdDepartamento("13,06,14")).toEqual(["13", "06", "14"]);
  });

  it("recorta espacios alrededor de cada código", () => {
    expect(parseIdDepartamento("13, 06 , 14")).toEqual(["13", "06", "14"]);
  });
});

describe("parseGisFeature", () => {
  const validFeature: GisRawFeature = {
    type: "Feature",
    geometry: '{"type": "Point","coordinates":[-77.110608,-12.068699]}',
    properties: {
      IDPROYECTO: 244,
      NOMBREPROYECTO: "Concesión Única de Telecomunicaciones",
      SECTOR: "Telecomunicaciones",
      FASE: "Ejecución Contractual",
      TIPOPROYECTO: "APP",
      IDDEPARTAMENTO: null,
      CODIGO: "PUN-418",
      TIPOCOORDENADANOMBRE: "Punto",
    },
  };

  it("normaliza una feature válida", () => {
    const row = parseGisFeature(validFeature);
    expect(row).toMatchObject({
      codigo: "PUN-418",
      idProyecto: 244,
      nombreProyecto: "Concesión Única de Telecomunicaciones",
      sector: "Telecomunicaciones",
      tipoProyecto: "APP",
      departamentosInei: [],
      geometry: { type: "Point", coordinates: [-77.110608, -12.068699] },
    });
  });

  it("retorna null cuando falta CODIGO", () => {
    expect(parseGisFeature({ ...validFeature, properties: { ...validFeature.properties, CODIGO: null } })).toBeNull();
  });

  it("retorna null cuando geometry no es JSON válido", () => {
    expect(parseGisFeature({ ...validFeature, geometry: "no es json" })).toBeNull();
  });

  it("parsea departamentosInei desde una lista multi-región", () => {
    const row = parseGisFeature({
      ...validFeature,
      properties: { ...validFeature.properties, IDDEPARTAMENTO: "13,06,14" },
    });
    expect(row?.departamentosInei).toEqual(["13", "06", "14"]);
  });
});
