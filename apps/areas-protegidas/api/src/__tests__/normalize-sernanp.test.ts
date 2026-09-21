import { describe, expect, it } from "vitest";
import { normalizeAreas } from "../ingest/normalize-sernanp.js";

describe("normalizeAreas", () => {
  // Feature real confirmada 2026-09-21 contra capa 1 (ANP Nacional Definitiva).
  function anpFeature(overrides: Record<string, unknown> = {}) {
    return {
      attributes: {
        objectid: 17938,
        anp_gid: 379,
        anp_codi: "PN05",
        anp_cate: "Parque Nacional",
        anp_nomb: "Cerros de Amotape",
        anp_ubpo: "Tumbes y Piura",
        anp_suleg: 152045.13,
        anp_balec: "D.S. N° 0800-1975-AG",
        anp_felec: 175237200000,
        anp_balem: "LEY N° 30359, D.S. N° 046-2006-AG (07/07/2006)",
        anp_felem: 1431320400000,
        anp_obs: "Observación real",
        anp_id: 5,
        ...overrides,
      },
    };
  }

  it("normaliza una feature real de anp_nacional_definitiva", () => {
    const { rows, rejected } = normalizeAreas([anpFeature()], "anp_nacional_definitiva");
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({
      capa: "anp_nacional_definitiva",
      objectid: 17938,
      codigo: "PN05",
      categoria: "Parque Nacional",
      nombre: "Cerros de Amotape",
      ubicacion: "Tumbes y Piura",
      superficieHa: 152045.13,
    });
  });

  it("convierte fechas epoch ms a fecha ISO date-only", () => {
    const { rows } = normalizeAreas([anpFeature()], "anp_nacional_definitiva");
    expect(rows[0].fechaEstablecimiento).toBe("1975-07-22");
  });

  it("no asigna categoria a capas distintas de anp_nacional_definitiva", () => {
    const zrFeature = {
      attributes: {
        objectid: 17256, anp_gid: 105, zr_codi: "ZR17", zr_nomb: "Ancón", zr_ubpo: "",
        anp_suleg: 2193.01, zr_balec: "R.M. N° 275-2011-MINAM", zr_felec: 1322456400000,
      },
    };
    const { rows } = normalizeAreas([zrFeature], "zona_reservada");
    expect(rows[0].categoria).toBeNull();
    expect(rows[0].codigo).toBe("ZR17");
  });

  it("mapea campos específicos de area_conservacion_privada a atributosExtra sin perderlos", () => {
    const acpFeature = {
      attributes: {
        objectid: 17538, anp_gid: 376, acp_codi: "ACP168", acp_nomb: "Yasgolca", acp_ubpo: "AMAZONAS",
        anp_suleg: 4725.69, acp_titu: "Comunidad Campesina Montevideo", acp_tipro: "Comunidad Campesina",
        acp_tirec: "Perpetuo", acp_pareg: "P.E. N° 02013530", acp_fecad: "Perpetuo",
      },
    };
    const { rows } = normalizeAreas([acpFeature], "area_conservacion_privada");
    expect(rows[0].atributosExtra).toMatchObject({
      acp_titu: "Comunidad Campesina Montevideo",
      acp_tipro: "Comunidad Campesina",
      acp_tirec: "Perpetuo",
      acp_pareg: "P.E. N° 02013530",
    });
  });

  it("usa sp_sup (no anp_suleg) como superficie para sitios_prioritarios, y sp_cod como código", () => {
    const spFeature = {
      attributes: {
        objectid: 1, sp_cod: "ZP_0020", sp_pri: "1", sp_cf: "Ecorregión con CF <=60",
        sp_ib: "Importancia biológica alta", sp_ci: "Muy prioritario. Top 10%.", sp_sup: 6562141.99604,
      },
    };
    const { rows } = normalizeAreas([spFeature], "sitios_prioritarios");
    expect(rows[0].codigo).toBe("ZP_0020");
    expect(rows[0].superficieHa).toBe(6562141.99604);
    expect(rows[0].nombre).toBeNull(); // la fuente no trae nombre para esta capa
    expect(rows[0].atributosExtra).toMatchObject({ sp_pri: "1", sp_cf: "Ecorregión con CF <=60" });
  });

  it("rechaza una feature sin objectid", () => {
    const { rows, rejected } = normalizeAreas([{ attributes: { anp_codi: "PN05" } }], "anp_nacional_definitiva");
    expect(rows).toEqual([]);
    expect(rejected[0].reason).toMatch(/objectid/);
  });

  it("trata fechas ausentes o inválidas como null, sin descartar la fila", () => {
    const { rows, rejected } = normalizeAreas([anpFeature({ anp_felec: null, anp_felem: "no-es-epoch" })], "anp_nacional_definitiva");
    expect(rejected).toEqual([]);
    expect(rows[0].fechaEstablecimiento).toBeNull();
    expect(rows[0].fechaModificacion).toBeNull();
  });

  it("no incluye atributosExtra vacío como objeto (queda null)", () => {
    const { rows } = normalizeAreas([anpFeature()], "anp_nacional_definitiva");
    expect(rows[0].atributosExtra).toBeNull();
  });
});
