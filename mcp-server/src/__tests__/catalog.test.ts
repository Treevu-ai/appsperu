import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "../catalog.js";
import { APP_KEYS, type AppKey } from "../apps.js";

/**
 * Lista de referencia versionada junto al test (CX-11, ver
 * docs/adr/0019-alcance-workspace-utilidades-compartidas.md y
 * docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md). No se
 * re-deriva de las rutas Express reales de cada app — eso sería un chequeo
 * distinto y más caro (requeriría introspección de las 14 APIs), fuera de
 * alcance aquí. Esta lista solo detecta si `TOOL_CATALOG` se desincroniza de
 * lo que alguien decidió que debía tener cada app — un tool agregado,
 * renombrado o borrado sin querer.
 *
 * Generada a partir del `TOOL_CATALOG` real al momento de escribir este test
 * (2026-09-05) agrupando por `app` y ordenando alfabéticamente los nombres.
 */
const EXPECTED_TOOLS_BY_APP: Record<AppKey, string[]> = {
  "actividad-agraria": [
    "actividad_agraria_crossref",
    "actividad_agraria_regional_outcome",
    "actividad_agraria_tractor_rental",
    "actividad_agraria_wage",
    "actividad_agraria_yunta_rental",
  ],
  "bcrp-comercio-exterior": ["bcrp_meta_sources", "bcrp_trade"],
  "bcrp-la-libertad": ["bcrp_la_libertad_indicadores"],
  "ceplan-estrategico": [
    "ceplan_estrategico_crossref",
    "ceplan_estrategico_crossref_territorial",
    "ceplan_estrategico_indicators",
    "ceplan_estrategico_indicators_execution_efficiency",
    "ceplan_estrategico_indicators_plan_budget_alignment",
    "ceplan_estrategico_indicators_seg",
    "ceplan_estrategico_meta_aplicativo",
  ],
  "ceplan-geo": [
    "ceplan_geo_crossref_ejecucion",
    "ceplan_geo_crossref_inversiones",
    "ceplan_geo_crossref_obras",
    "ceplan_geo_denominadores_poblacion",
    "ceplan_geo_denominadores_tasas",
    "ceplan_geo_infrastructure",
    "ceplan_geo_infrastructure_near",
    "ceplan_geo_layer_by_id",
    "ceplan_geo_layer_features",
    "ceplan_geo_layers",
    "ceplan_geo_territories",
    "ceplan_geo_territories_bbox",
    "ceplan_geo_territories_summary",
  ],
  "compras-publicas": [
    "compras_publicas_crossref",
    "compras_publicas_procurement",
    "compras_publicas_procurement_by_ocid",
    "compras_publicas_supplier_by_id",
    "compras_publicas_suppliers",
  ],
  "identidad-fiscal": [
    "identidad_fiscal_contribuyente_by_ruc",
    "identidad_fiscal_contribuyentes",
    "identidad_fiscal_crossref_entidades",
    "identidad_fiscal_crossref_proveedores",
  ],
  infobras: [
    "infobras_crossref",
    "infobras_crossref_ejecucion",
    "infobras_public_work_by_codigo",
    "infobras_public_works",
    "infobras_public_works_resumen",
  ],
  "inversion-privada": [
    "inversion_privada_gis_geojson",
    "inversion_privada_gis_project_geometry",
    "inversion_privada_meta_sources",
    "inversion_privada_oxi_crossref_invierte",
    "inversion_privada_oxi_projects",
    "inversion_privada_project_by_id",
    "inversion_privada_projects",
  ],
  "proveedores-sancionados": ["proveedores_sancionados_crossref", "proveedores_sancionados_sanciones"],
  "radar-ejecucion": [
    "radar_ejecucion_benchmark",
    "radar_ejecucion_budget_movement",
    "radar_ejecucion_care_services",
    "radar_ejecucion_execution",
    "radar_ejecucion_execution_by_entity",
    "radar_ejecucion_food_coverage",
    "radar_ejecucion_food_evidence_queue",
    "radar_ejecucion_food_integrity",
    "radar_ejecucion_food_lots",
    "radar_ejecucion_food_supplier",
    "radar_ejecucion_infrastructure_asset",
    "radar_ejecucion_infrastructure_assets",
    "radar_ejecucion_infrastructure_evidence_queue",
    "radar_ejecucion_infrastructure_integrity",
    "radar_ejecucion_infrastructure_maintenance",
    "radar_ejecucion_infrastructure_operation",
    "radar_ejecucion_lluvias_seguimiento",
    "radar_ejecucion_meta_sources",
    "radar_ejecucion_sector_comparativo",
    "radar_ejecucion_sector_ficha",
    "radar_ejecucion_sector_inventory",
    "radar_ejecucion_sector_review_queue",
    "radar_ejecucion_supplier_observations",
    "radar_ejecucion_supplier_observations_unlinked",
    "radar_ejecucion_tourism_crossref",
    "radar_ejecucion_tourism_hospedaje",
  ],
  "radar-inversiones": ["radar_inversiones_crossref", "radar_inversiones_investment_by_cui", "radar_inversiones_investments"],
  "salud-institucional": ["salud_institucional_score"],
  "seguridad-ciudadana": ["seguridad_ciudadana_crossref", "seguridad_ciudadana_denuncias"],
};

describe("MCP catalog", () => {
  it("covers every app declared in APP_KEYS with an expected-tools entry", () => {
    // Si se agrega una app nueva a APP_KEYS sin agregarla acá, este test
    // falla explícito en vez de simplemente no revisarla.
    for (const app of APP_KEYS) {
      expect(EXPECTED_TOOLS_BY_APP, `Falta EXPECTED_TOOLS_BY_APP["${app}"]`).toHaveProperty(app);
    }
  });

  for (const app of Object.keys(EXPECTED_TOOLS_BY_APP) as AppKey[]) {
    it(`registers exactly the expected tools for ${app}`, () => {
      const expected = [...EXPECTED_TOOLS_BY_APP[app]].sort();
      const actual = TOOL_CATALOG.filter((tool) => tool.app === app)
        .map((tool) => tool.name)
        .sort();
      expect(actual, `Tools de "${app}" no coinciden con EXPECTED_TOOLS_BY_APP`).toEqual(expected);
    });
  }

  it("has no tool name duplicated across the whole catalog", () => {
    const names = TOOL_CATALOG.map((tool) => tool.name);
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it("includes ceplan-geo in app keys with default port 4005", () => {
    expect(APP_KEYS).toContain("ceplan-geo");
  });
});
