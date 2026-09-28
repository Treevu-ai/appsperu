// ARCHIVO GENERADO — no editar a mano.
// Regenerar: node scripts/gen-handler-registry.mjs
// Verificar en CI:  node scripts/gen-handler-registry.mjs --check
//
// Mapa estático de módulos de handler, indexado por "<app>/<modulo>". Cada valor
// es el namespace del módulo, de donde `resolveHandler` toma la función indicada
// en el campo `handler` del tool ("<modulo>:<funcion>"). Ver el docblock del
// script generador para por qué no puede ser un `import()` dinámico.
import * as compras_publicas_bidders from "./compras-publicas/bidders.js";
import * as compras_publicas_conformacion from "./compras-publicas/conformacion.js";
import * as compras_publicas_crossref from "./compras-publicas/crossref.js";
import * as compras_publicas_entity_profiles from "./compras-publicas/entity-profiles.js";
import * as compras_publicas_identities from "./compras-publicas/identities.js";
import * as compras_publicas_minor_contracts from "./compras-publicas/minor-contracts.js";
import * as compras_publicas_observatory from "./compras-publicas/observatory.js";
import * as compras_publicas_procurement from "./compras-publicas/procurement.js";
import * as compras_publicas_suppliers from "./compras-publicas/suppliers.js";
import * as compras_publicas_unsuccessful_tenders from "./compras-publicas/unsuccessful-tenders.js";
import * as identidad_fiscal_contribuyentes from "./identidad-fiscal/contribuyentes.js";
import * as identidad_fiscal_crossref from "./identidad-fiscal/crossref.js";
import * as identidad_fiscal_exportaciones_fob from "./identidad-fiscal/exportaciones-fob.js";
import * as identidad_fiscal_ficha_ruc from "./identidad-fiscal/ficha-ruc.js";
import * as identidad_fiscal_oece_ficha from "./identidad-fiscal/oece-ficha.js";
import * as identidad_fiscal_padron_ppa from "./identidad-fiscal/padron-ppa.js";
import * as identidad_fiscal_ruc_consulta_masiva from "./identidad-fiscal/ruc-consulta-masiva.js";
import * as infobras_crossref from "./infobras/crossref.js";
import * as infobras_meta from "./infobras/meta.js";
import * as infobras_public_works from "./infobras/public-works.js";
import * as proveedores_sancionados_candidatos_sancionados from "./proveedores-sancionados/candidatos-sancionados.js";
import * as proveedores_sancionados_crossref from "./proveedores-sancionados/crossref.js";
import * as proveedores_sancionados_doble_inhabilitacion from "./proveedores-sancionados/doble-inhabilitacion.js";
import * as proveedores_sancionados_extorsion_duenos_reales from "./proveedores-sancionados/extorsion-duenos-reales.js";
import * as proveedores_sancionados_extorsion_sancionados from "./proveedores-sancionados/extorsion-sancionados.js";
import * as proveedores_sancionados_extorsion_velocidad_sancion from "./proveedores-sancionados/extorsion-velocidad-sancion.js";
import * as proveedores_sancionados_inhabilitaciones_judiciales from "./proveedores-sancionados/inhabilitaciones-judiciales.js";
import * as proveedores_sancionados_meta_freshness from "./proveedores-sancionados/meta-freshness.js";
import * as proveedores_sancionados_personas_sancionadas from "./proveedores-sancionados/personas-sancionadas.js";
import * as proveedores_sancionados_redes_proveedores from "./proveedores-sancionados/redes-proveedores.js";
import * as proveedores_sancionados_sancionado_recurrente from "./proveedores-sancionados/sancionado-recurrente.js";
import * as proveedores_sancionados_sanciones from "./proveedores-sancionados/sanciones.js";
import * as proveedores_sancionados_velocidad_sancion_contrato from "./proveedores-sancionados/velocidad-sancion-contrato.js";
import * as radar_ejecucion_benchmark from "./radar-ejecucion/benchmark.js";
import * as radar_ejecucion_bienes_muebles_baja from "./radar-ejecucion/bienes-muebles-baja.js";
import * as radar_ejecucion_bienes_muebles_baja_por_distrito from "./radar-ejecucion/bienes-muebles-baja-por-distrito.js";
import * as radar_ejecucion_burocracia_inversion from "./radar-ejecucion/burocracia-inversion.js";
import * as radar_ejecucion_care_services from "./radar-ejecucion/care-services.js";
import * as radar_ejecucion_execution from "./radar-ejecucion/execution.js";
import * as radar_ejecucion_food from "./radar-ejecucion/food.js";
import * as radar_ejecucion_infrastructure from "./radar-ejecucion/infrastructure.js";
import * as radar_ejecucion_lluvias from "./radar-ejecucion/lluvias.js";
import * as radar_ejecucion_meta from "./radar-ejecucion/meta.js";
import * as radar_ejecucion_personal from "./radar-ejecucion/personal.js";
import * as radar_ejecucion_proyectos from "./radar-ejecucion/proyectos.js";
import * as radar_ejecucion_sectors from "./radar-ejecucion/sectors.js";
import * as radar_ejecucion_tourism from "./radar-ejecucion/tourism.js";

export const MODULOS: Record<string, Record<string, unknown>> = {
  "compras-publicas/bidders": compras_publicas_bidders,
  "compras-publicas/conformacion": compras_publicas_conformacion,
  "compras-publicas/crossref": compras_publicas_crossref,
  "compras-publicas/entity-profiles": compras_publicas_entity_profiles,
  "compras-publicas/identities": compras_publicas_identities,
  "compras-publicas/minor-contracts": compras_publicas_minor_contracts,
  "compras-publicas/observatory": compras_publicas_observatory,
  "compras-publicas/procurement": compras_publicas_procurement,
  "compras-publicas/suppliers": compras_publicas_suppliers,
  "compras-publicas/unsuccessful-tenders": compras_publicas_unsuccessful_tenders,
  "identidad-fiscal/contribuyentes": identidad_fiscal_contribuyentes,
  "identidad-fiscal/crossref": identidad_fiscal_crossref,
  "identidad-fiscal/exportaciones-fob": identidad_fiscal_exportaciones_fob,
  "identidad-fiscal/ficha-ruc": identidad_fiscal_ficha_ruc,
  "identidad-fiscal/oece-ficha": identidad_fiscal_oece_ficha,
  "identidad-fiscal/padron-ppa": identidad_fiscal_padron_ppa,
  "identidad-fiscal/ruc-consulta-masiva": identidad_fiscal_ruc_consulta_masiva,
  "infobras/crossref": infobras_crossref,
  "infobras/meta": infobras_meta,
  "infobras/public-works": infobras_public_works,
  "proveedores-sancionados/candidatos-sancionados": proveedores_sancionados_candidatos_sancionados,
  "proveedores-sancionados/crossref": proveedores_sancionados_crossref,
  "proveedores-sancionados/doble-inhabilitacion": proveedores_sancionados_doble_inhabilitacion,
  "proveedores-sancionados/extorsion-duenos-reales": proveedores_sancionados_extorsion_duenos_reales,
  "proveedores-sancionados/extorsion-sancionados": proveedores_sancionados_extorsion_sancionados,
  "proveedores-sancionados/extorsion-velocidad-sancion": proveedores_sancionados_extorsion_velocidad_sancion,
  "proveedores-sancionados/inhabilitaciones-judiciales": proveedores_sancionados_inhabilitaciones_judiciales,
  "proveedores-sancionados/meta-freshness": proveedores_sancionados_meta_freshness,
  "proveedores-sancionados/personas-sancionadas": proveedores_sancionados_personas_sancionadas,
  "proveedores-sancionados/redes-proveedores": proveedores_sancionados_redes_proveedores,
  "proveedores-sancionados/sancionado-recurrente": proveedores_sancionados_sancionado_recurrente,
  "proveedores-sancionados/sanciones": proveedores_sancionados_sanciones,
  "proveedores-sancionados/velocidad-sancion-contrato": proveedores_sancionados_velocidad_sancion_contrato,
  "radar-ejecucion/benchmark": radar_ejecucion_benchmark,
  "radar-ejecucion/bienes-muebles-baja": radar_ejecucion_bienes_muebles_baja,
  "radar-ejecucion/bienes-muebles-baja-por-distrito": radar_ejecucion_bienes_muebles_baja_por_distrito,
  "radar-ejecucion/burocracia-inversion": radar_ejecucion_burocracia_inversion,
  "radar-ejecucion/care-services": radar_ejecucion_care_services,
  "radar-ejecucion/execution": radar_ejecucion_execution,
  "radar-ejecucion/food": radar_ejecucion_food,
  "radar-ejecucion/infrastructure": radar_ejecucion_infrastructure,
  "radar-ejecucion/lluvias": radar_ejecucion_lluvias,
  "radar-ejecucion/meta": radar_ejecucion_meta,
  "radar-ejecucion/personal": radar_ejecucion_personal,
  "radar-ejecucion/proyectos": radar_ejecucion_proyectos,
  "radar-ejecucion/sectors": radar_ejecucion_sectors,
  "radar-ejecucion/tourism": radar_ejecucion_tourism,
};
