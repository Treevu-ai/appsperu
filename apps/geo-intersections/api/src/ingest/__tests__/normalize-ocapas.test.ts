import { describe, expect, it } from "vitest";
import { normalizeOcapasFeatures } from "../normalize-ocapas.js";

function buildFeature(attributes: Record<string, unknown>, rings?: number[][][]) {
  return {
    attributes,
    geometry: { rings: rings ?? [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
}

describe("normalizeOcapasFeatures", () => {
  // Attributes tomados de una respuesta real de la capa 26 (comunidades_campesinas),
  // consultada en vivo el 2026-10-06.
  it("mapea los campos reales de comunidades_campesinas (capa 26)", () => {
    const feature = buildFeature({
      nomcom: "PUCA URCO",
      painre: null,
      ofinre: "Z. R. N° 4 - MAYNAS",
      depar: "LORETO",
      provi: "MAYNAS",
      distr: " ",
      ubidis: " ",
      "SHAPE.STArea()": 0.0243045,
      "SHAPE.STLength()": 0.701,
      OBJECTID: 1,
      gml_id: null,
      OBJECTID_WFS: null,
      prodes: null,
      feinre: 892521615000,
      Aarea: 29837.299129480001,
      centroide_e: 609837.5345,
      centroide_n: 9580689.8947,
      accion: null,
      fecha_carga: "02/10/2024",
    });

    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");

    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      objectid: 1,
      nombre: "PUCA URCO",
      departamento: "LORETO",
      provincia: "MAYNAS",
      distrito: null, // "distr" viene como espacio en blanco -> trim a null
      area_ha: 29837.299129480001,
      titulo: null, // titcom no existe en capa 26
      zona_utm: null,
      coordenada_x: 609837.5345,
      coordenada_y: 9580689.8947,
    });
    expect(rows[0].atributos_extra).toMatchObject({
      ofinre: "Z. R. N° 4 - MAYNAS",
      feinre: 892521615000,
      fecha_carga: "02/10/2024",
    });

    const geojson = JSON.parse(rows[0].geometry);
    expect(geojson.type).toBe("MultiPolygon");
    expect(geojson.coordinates).toHaveLength(1); // un solo shell exterior, sin holes
  });

  // Attributes de la capa 27 (comunidades_nativas), misma consulta en vivo.
  it("mapea titcom como titulo en comunidades_nativas (capa 27)", () => {
    const feature = buildFeature({
      nomcom: "LAS MALVINAS",
      prodem: null,
      restit: "R.D. 457-2017-GRL-DRA-L",
      titcom: "058-2016-GRL-DRA-L",
      depar: "LORETO",
      provi: "LORETO",
      distr: "NAUTA",
      ubidis: "160301",
      OBJECTID: 1,
      Aarea: 258.05123119,
      centroide_e: 637351.1605,
      centroide_n: 9490388.9988,
    });

    const { rows } = normalizeOcapasFeatures([feature], "comunidades_nativas");

    expect(rows[0].distrito).toBe("NAUTA");
    expect(rows[0].titulo).toBe("058-2016-GRL-DRA-L");
    expect(rows[0].atributos_extra).toMatchObject({ ubidis: "160301", restit: "R.D. 457-2017-GRL-DRA-L" });
  });

  it("deja atributos_extra en null cuando no hay campos sin mapear", () => {
    const feature = buildFeature({ OBJECTID: 2, nomcom: "Comunidad Sin Extras" });
    const { rows } = normalizeOcapasFeatures([feature], "comunidades_nativas");
    expect(rows[0].atributos_extra).toBeNull();
  });

  it("rechaza features sin OBJECTID", () => {
    const feature = buildFeature({ nomcom: "Sin id" });
    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("OBJECTID ausente");
  });

  it("rechaza features sin geometry.rings", () => {
    const feature = { attributes: { OBJECTID: 3 }, geometry: { rings: [] } };
    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("geometry.rings ausente o vacío");
  });

  it("rechaza features con un ring malformado (punto no numérico)", () => {
    const feature = buildFeature({ OBJECTID: 4 }, [[[0, 0], [1, "x" as unknown as number], [1, 1], [0, 0]]]);
    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("geometry.rings contiene un anillo inválido");
  });

  it("rechaza features con un ring de menos de 3 puntos", () => {
    const feature = buildFeature({ OBJECTID: 5 }, [[[0, 0], [1, 1]]]);
    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("geometry.rings contiene un anillo inválido");
  });

  // Caso real confirmado en vivo (2026-10-06): OBJECTID 7 "PUERTO ANGEL" en
  // comunidades_campesinas tiene 2 rings, AMBOS clockwise (dos shells exteriores
  // disjuntos, no un hole). Fixture con la misma orientación verificada.
  it("preserva shells exteriores disjuntos como MultiPolygon, no los trata como holes", () => {
    const shellA = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]; // CW -> exterior
    const shellB = [[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]]; // CW -> exterior (disjunto)
    const feature = buildFeature({ OBJECTID: 7, nomcom: "PUERTO ANGEL" }, [shellA, shellB]);

    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rejected).toHaveLength(0);

    const geojson = JSON.parse(rows[0].geometry);
    expect(geojson.type).toBe("MultiPolygon");
    expect(geojson.coordinates).toHaveLength(2); // dos shells, no uno con un hole
    expect(geojson.coordinates[0]).toHaveLength(1); // shell A sin holes
    expect(geojson.coordinates[1]).toHaveLength(1); // shell B sin holes
  });

  it("agrupa un ring counter-clockwise como hole de su shell exterior más reciente", () => {
    const exterior = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]; // CW -> exterior
    const hole = [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]; // CCW -> hole
    const feature = buildFeature({ OBJECTID: 6, nomcom: "SAN JUAN DE MIRAFLORES" }, [exterior, hole]);

    const { rows, rejected } = normalizeOcapasFeatures([feature], "comunidades_campesinas");
    expect(rejected).toHaveLength(0);

    const geojson = JSON.parse(rows[0].geometry);
    expect(geojson.type).toBe("MultiPolygon");
    expect(geojson.coordinates).toHaveLength(1); // un solo shell
    expect(geojson.coordinates[0]).toHaveLength(2); // exterior + 1 hole
  });
});
