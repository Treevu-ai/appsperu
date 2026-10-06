import { describe, expect, it } from "vitest";
import { normalizeOcapasFeatures } from "../normalize-ocapas.js";

function buildFeature(attributes: Record<string, unknown>) {
  return {
    attributes,
    geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
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
});
