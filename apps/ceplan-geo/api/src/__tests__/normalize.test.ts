import { describe, expect, it } from "vitest";
import {
  featureIdFromGeoJson,
  normalizeTerritoryToken,
  parseAgroProjectName,
  parseDistrictProperties,
  parseHydroPrincipalName,
  parseInfrastructureName,
} from "../ingest/normalize.js";

describe("normalize", () => {
  it("normalizes territory tokens with accents and spacing", () => {
    expect(normalizeTerritoryToken("  la libertad ")).toBe("LA LIBERTAD");
    expect(normalizeTerritoryToken("Muñeca")).toBe("MUNECA");
  });

  it("parses distrito properties with ubigeo", () => {
    const parsed = parseDistrictProperties({
      dpto: "HUANUCO",
      prov: "PUERTO INCA",
      dist: "CODO DEL POZUZO",
      ubigeo: "100902",
    });

    expect(parsed).toEqual({
      ubigeo: "100902",
      departamento: "HUANUCO",
      provincia: "PUERTO INCA",
      distrito: "CODO DEL POZUZO",
    });
  });

  it("rejects distrito properties without ubigeo de 6 dígitos", () => {
    expect(parseDistrictProperties({ dpto: "LIMA", ubigeo: "15" })).toBeNull();
  });

  it("parses nombres de infraestructura por tipo", () => {
    expect(parseInfrastructureName({ fna: "AEROPUERTO ANDAHUAYLAS" }, "aeropuerto")).toBe(
      "AEROPUERTO ANDAHUAYLAS"
    );
    expect(parseInfrastructureName({ nompue: "MATARANI" }, "puerto")).toBe("MATARANI");
  });

  it("parses red hidrica principal and proyecto agro", () => {
    expect(parseHydroPrincipalName({ nombre_ca: "CANAL CHAVIMOCHIC" })).toBe("CANAL CHAVIMOCHIC");
    expect(parseAgroProjectName({ codigounic: "PRY-001", nombre: "RIEGO VALLE" })).toBe("RIEGO VALLE");
  });

  it("derives feature id from GeoJSON id or fallback", () => {
    expect(featureIdFromGeoJson({ id: "cb_limdistx.12" }, 0)).toBe("cb_limdistx.12");
    expect(featureIdFromGeoJson({}, 3)).toBe("feature-3");
  });
});
