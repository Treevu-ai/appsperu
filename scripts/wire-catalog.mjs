/**
 * Inserta `handler: "modulo:funcion"` en los tools de catalog.ts que ya tienen
 * handler portado, usando el mapeo derivado de las rutas Express de origen.
 *
 *   node scripts/wire-catalog.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const catalogoPath = join(here, "..", "mcp-server", "src", "catalog.ts");
const checkOnly = process.argv.includes("--check");

const MAPEO = {
  "compras_publicas_procurement": "procurement:list",
  "compras_publicas_procurement_by_ocid": "procurement:byOcid",
  "compras_publicas_suppliers": "suppliers:list",
  "compras_publicas_supplier_by_id": "suppliers:bySupplierId",
  "compras_publicas_crossref": "crossref:list",
  "compras_publicas_crossref_salud": "crossref:salud",
  "compras_publicas_unsuccessful_tenders": "unsuccessful-tenders:list",
  "compras_publicas_bidders_by_ocid": "bidders:byOcid",
  "compras_publicas_bidders_by_provider": "bidders:byProviderId",
  "compras_publicas_bidders_competition": "bidders:competition",
  "compras_publicas_bidders_coparticipation": "bidders:coparticipation",
  "compras_publicas_entity_profile": "entity-profiles:byBuyerId",
  "compras_publicas_identities": "identities:list",
  "compras_publicas_conformacion_vinculos": "conformacion:vinculos",
  "compras_publicas_conformacion_by_ruc": "conformacion:byRuc",
  "compras_publicas_minor_contracts": "minor-contracts:list",
  "compras_publicas_minor_contract_by_id": "minor-contracts:byId",
  "compras_publicas_municipalities": "observatory:municipalities",
  "compras_publicas_municipality_by_id": "observatory:municipalityById",
  "compras_publicas_signals": "observatory:signals",
  "compras_publicas_signal_by_id": "observatory:signalById",
  "compras_publicas_semantic_review_queue": "observatory:semanticReviewQueue",
  "compras_publicas_semantic_review_clusters": "observatory:semanticReviewClusters",
  "compras_publicas_freshness": "observatory:freshness",
  "compras_publicas_analytics_territorial": "observatory:analyticsTerritorial",
  "compras_publicas_analytics": "observatory:analyticsKind",

  "identidad_fiscal_contribuyentes": "contribuyentes:list",
  "identidad_fiscal_contribuyente_by_ruc": "contribuyentes:byRuc",
  "identidad_fiscal_crossref_proveedores": "crossref:list",
  "identidad_fiscal_crossref_entidades": "crossref:entidades",
  "identidad_fiscal_ficha_ruc": "ficha-ruc:list",
  "identidad_fiscal_ficha_ruc_by_ruc": "ficha-ruc:byRuc",
  "identidad_fiscal_padron_ppa": "padron-ppa:list",
  "identidad_fiscal_padron_ppa_by_ruc": "padron-ppa:byRuc",
  "identidad_fiscal_oece_ficha": "oece-ficha:list",
  "identidad_fiscal_oece_ficha_by_ruc": "oece-ficha:byRuc",
  "identidad_fiscal_ruc_consulta_masiva": "ruc-consulta-masiva:list",
  "identidad_fiscal_ruc_consulta_masiva_by_ruc": "ruc-consulta-masiva:byRuc",
  "identidad_fiscal_exportaciones_fob": "exportaciones-fob:list",
  "identidad_fiscal_exportaciones_fob_resumen": "exportaciones-fob:resumenPorRuc",

  "proveedores_sancionados_sanciones": "sanciones:list",
  "proveedores_sancionados_crossref": "crossref:list",
  "proveedores_sancionados_personas": "personas-sancionadas:list",
  "proveedores_sancionados_candidatos_sancionados": "candidatos-sancionados:list",
  "proveedores_sancionados_recurrente": "sancionado-recurrente:list",
  "proveedores_sancionados_velocidad_sancion_contrato": "velocidad-sancion-contrato:list",
  "proveedores_sancionados_redes_proveedores": "redes-proveedores:list",
  "proveedores_sancionados_inhabilitaciones_judiciales": "inhabilitaciones-judiciales:list",
  "proveedores_sancionados_doble_inhabilitacion": "doble-inhabilitacion:list",
  "proveedores_sancionados_extorsion_duenos_reales": "extorsion-duenos-reales:list",
  "proveedores_sancionados_extorsion_sancionados": "extorsion-sancionados:list",
  "proveedores_sancionados_extorsion_velocidad_sancion": "extorsion-velocidad-sancion:list",
  "proveedores_sancionados_meta_freshness": "meta-freshness:freshness",

  "infobras_meta_sources": "meta:sources",
  "infobras_public_works": "public-works:list",
  "infobras_public_works_resumen": "public-works:resumen",
  "infobras_public_work_by_codigo": "public-works:byCodigo",
  "infobras_crossref": "crossref:list",
  "infobras_crossref_salud": "crossref:salud",
  "infobras_crossref_ejecucion": "crossref:ejecucion",

  "radar_ejecucion_execution_resumen": "execution:resumen",
  "radar_ejecucion_benchmark": "benchmark:byEntityCode",
  "radar_ejecucion_meta_sources": "meta:sources",
  "radar_ejecucion_lluvias_seguimiento": "lluvias:seguimiento",
  "radar_ejecucion_sector_inventory": "sectors:inventory",
  "radar_ejecucion_sector_ficha": "sectors:ficha",
  "radar_ejecucion_sector_entidad_ficha": "sectors:entidadFicha",
  "radar_ejecucion_sector_comparativo": "sectors:comparativo",
  "radar_ejecucion_budget_movement": "sectors:budgetMovement",
  "radar_ejecucion_sector_review_queue": "sectors:reviewQueue",
  "radar_ejecucion_care_services": "care-services:list",
  "radar_ejecucion_care_service_by_id": "care-services:byId",
  "radar_ejecucion_food_lots": "food:lots",
  "radar_ejecucion_food_coverage": "food:coverage",
  "radar_ejecucion_food_supplier": "food:supplierByRuc",
  "radar_ejecucion_food_integrity": "food:integrity",
  "radar_ejecucion_food_evidence_queue": "food:evidenceQueue",
  "radar_ejecucion_supplier_observations": "food:observationsByRuc",
  "radar_ejecucion_supplier_observations_unlinked": "food:observationsUnlinked",
  "radar_ejecucion_tourism_hospedaje": "tourism:hospedaje",
  "radar_ejecucion_tourism_crossref": "tourism:crossref",
  "radar_ejecucion_infrastructure_assets": "infrastructure:assets",
  "radar_ejecucion_infrastructure_asset": "infrastructure:asset",
  "radar_ejecucion_infrastructure_operation": "infrastructure:assetOperation",
  "radar_ejecucion_infrastructure_maintenance": "infrastructure:assetMaintenance",
  "radar_ejecucion_infrastructure_integrity": "infrastructure:integrity",
  "radar_ejecucion_infrastructure_evidence_queue": "infrastructure:evidenceQueue",
  "radar_ejecucion_proyectos": "proyectos:list",
  "radar_ejecucion_personal": "personal:list",
  "radar_ejecucion_patrimonio_bienes_muebles_baja": "bienes-muebles-baja:list",
  "radar_ejecucion_patrimonio_bienes_muebles_baja_por_distrito": "bienes-muebles-baja-por-distrito:list",
  "radar_ejecucion_burocracia_inversion": "burocracia-inversion:list",
};

let texto = readFileSync(catalogoPath, "utf8");
const eol = texto.includes("\r\n") ? "\r\n" : "\n";
const faltantes = [];
let insertados = 0;

for (const [tool, handler] of Object.entries(MAPEO)) {
  // Se localiza el bloque del tool por su `name:` y se inserta el handler
  // justo después de la línea `app:` del mismo bloque, que es donde ya lo
  // lleva el resto del catálogo.
  const re = new RegExp(`(^ {4}name: "${tool}",\\r?\\n(?:[^\\r\\n]*\\r?\\n)*?)( {4}app: "[^"]+",\\r?\\n)`, "m");
  const m = texto.match(re);
  if (!m) {
    faltantes.push(`${tool}: no se encontró el bloque en catalog.ts`);
    continue;
  }
  // ¿El bloque ya tiene handler? Se mira hasta el siguiente `name:`.
  const desde = m.index + m[0].length;
  const siguiente = texto.indexOf("\n    name: ", desde);
  const bloque = texto.slice(desde, siguiente === -1 ? texto.length : siguiente);
  if (/^\s*handler:/m.test(bloque)) continue;

  texto = texto.replace(re, `$1$2    handler: "${handler}",${eol}`);
  insertados++;
}

if (faltantes.length) {
  console.error("Problemas:\n  - " + faltantes.join("\n  - "));
  process.exit(1);
}

console.log(`${checkOnly ? "verificacion" : "escritura"}: ${insertados} handler(s) nuevo(s) en catalog.ts`);
if (!checkOnly) writeFileSync(catalogoPath, texto, "utf8");
