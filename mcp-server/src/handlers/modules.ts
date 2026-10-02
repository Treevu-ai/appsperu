// ARCHIVO GENERADO — no editar a mano.
// Regenerar: node scripts/gen-handler-registry.mjs
// Verificar en CI:  node scripts/gen-handler-registry.mjs --check
//
// Mapa estático de módulos de handler, indexado por "<app>/<modulo>". Cada valor
// es el namespace del módulo, de donde `resolveHandler` toma la función indicada
// en el campo `handler` del tool ("<modulo>:<funcion>"). Ver el docblock del
// script generador para por qué no puede ser un `import()` dinámico.
import * as actividad_agraria_crossref from "./actividad-agraria/crossref.js";
import * as actividad_agraria_regional_outcome from "./actividad-agraria/regional-outcome.js";
import * as actividad_agraria_tractor_rental from "./actividad-agraria/tractor-rental.js";
import * as actividad_agraria_wage from "./actividad-agraria/wage.js";
import * as actividad_agraria_yunta_rental from "./actividad-agraria/yunta-rental.js";
import * as actividad_empresarial_crossref from "./actividad-empresarial/crossref.js";
import * as actividad_empresarial_empresas from "./actividad-empresarial/empresas.js";
import * as areas_protegidas_areas from "./areas-protegidas/areas.js";
import * as autoridades_electas_autoridades from "./autoridades-electas/autoridades.js";
import * as bcrp_comercio_exterior_meta from "./bcrp-comercio-exterior/meta.js";
import * as bcrp_comercio_exterior_trade from "./bcrp-comercio-exterior/trade.js";
import * as bcrp_la_libertad_indicadores from "./bcrp-la-libertad/indicadores.js";
import * as bcrp_la_libertad_meta from "./bcrp-la-libertad/meta.js";
import * as candidatos_erm_candidatos from "./candidatos-erm/candidatos.js";
import * as catastro_forestal_crossref from "./catastro-forestal/crossref.js";
import * as catastro_forestal_titulos from "./catastro-forestal/titulos.js";
import * as catastro_minero_derechos from "./catastro-minero/derechos.js";
import * as ceplan_estrategico_crossref from "./ceplan-estrategico/crossref.js";
import * as ceplan_estrategico_crossref_territorial from "./ceplan-estrategico/crossref-territorial.js";
import * as ceplan_estrategico_indicators from "./ceplan-estrategico/indicators.js";
import * as ceplan_estrategico_indicators_execution_efficiency from "./ceplan-estrategico/indicators-execution-efficiency.js";
import * as ceplan_estrategico_indicators_plan_budget_alignment from "./ceplan-estrategico/indicators-plan-budget-alignment.js";
import * as ceplan_estrategico_indicators_seg from "./ceplan-estrategico/indicators-seg.js";
import * as ceplan_estrategico_meta from "./ceplan-estrategico/meta.js";
import * as ceplan_geo_crossref from "./ceplan-geo/crossref.js";
import * as ceplan_geo_denominadores from "./ceplan-geo/denominadores.js";
import * as ceplan_geo_infrastructure from "./ceplan-geo/infrastructure.js";
import * as ceplan_geo_layers from "./ceplan-geo/layers.js";
import * as ceplan_geo_patrimonio from "./ceplan-geo/patrimonio.js";
import * as ceplan_geo_territories from "./ceplan-geo/territories.js";
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
import * as emergencias_indeci_crossref from "./emergencias-indeci/crossref.js";
import * as emergencias_indeci_emergencias from "./emergencias-indeci/emergencias.js";
import * as geo_intersections_intersections from "./geo-intersections/intersections.js";
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
import * as informes_control_crossref from "./informes-control/crossref.js";
import * as informes_control_informes from "./informes-control/informes.js";
import * as infracciones_ambientales_crossref from "./infracciones-ambientales/crossref.js";
import * as infracciones_ambientales_infracciones from "./infracciones-ambientales/infracciones.js";
import * as infraestructura_mtc_aerodromos from "./infraestructura-mtc/aerodromos.js";
import * as infraestructura_mtc_peajes from "./infraestructura-mtc/peajes.js";
import * as infraestructura_mtc_terminales_portuarios from "./infraestructura-mtc/terminales-portuarios.js";
import * as infraestructura_mtc_vulnerabilidad from "./infraestructura-mtc/vulnerabilidad.js";
import * as instituciones_educativas_instituciones from "./instituciones-educativas/instituciones.js";
import * as instituciones_educativas_resumen from "./instituciones-educativas/resumen.js";
import * as instituciones_educativas_trayectoria from "./instituciones-educativas/trayectoria.js";
import * as inversion_privada_crossref from "./inversion-privada/crossref.js";
import * as inversion_privada_gis from "./inversion-privada/gis.js";
import * as inversion_privada_meta from "./inversion-privada/meta.js";
import * as inversion_privada_oxi from "./inversion-privada/oxi.js";
import * as inversion_privada_projects from "./inversion-privada/projects.js";
import * as legislativo_congreso_proyectos from "./legislativo-congreso/proyectos.js";
import * as mimp_cem from "./mimp/cem.js";
import * as mimp_chat100 from "./mimp/chat100.js";
import * as mindef_offset from "./mindef/offset.js";
import * as mindef_peace_missions from "./mindef/peace-missions.js";
import * as mindef_training_abroad from "./mindef/training-abroad.js";
import * as osinergmin_combustibles_grifos from "./osinergmin-combustibles/grifos.js";
import * as osinergmin_combustibles_precios from "./osinergmin-combustibles/precios.js";
import * as ositran_reclamos_recaudacion from "./ositran-reclamos/recaudacion.js";
import * as ositran_reclamos_reclamos from "./ositran-reclamos/reclamos.js";
import * as ositran_reclamos_trafico from "./ositran-reclamos/trafico.js";
import * as poder_judicial_procesos_judiciales from "./poder-judicial/procesos-judiciales.js";
import * as programas_sociales_cobertura from "./programas-sociales/cobertura.js";
import * as programas_sociales_crossref from "./programas-sociales/crossref.js";
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
import * as radar_inversiones_crossref from "./radar-inversiones/crossref.js";
import * as radar_inversiones_investments from "./radar-inversiones/investments.js";
import * as radar_inversiones_investments_desactivadas from "./radar-inversiones/investments-desactivadas.js";
import * as red_vial_subnacional_intervenciones from "./red-vial-subnacional/intervenciones.js";
import * as renamu_crossref from "./renamu/crossref.js";
import * as renamu_equipamiento from "./renamu/equipamiento.js";
import * as renamu_municipalidades from "./renamu/municipalidades.js";
import * as residuos_solidos_residuos from "./residuos-solidos/residuos.js";
import * as riesgo_fiscal_isds_mmm from "./riesgo-fiscal-isds/mmm.js";
import * as salud_institucional_score from "./salud-institucional/score.js";
import * as seguridad_ciudadana_comisarias from "./seguridad-ciudadana/comisarias.js";
import * as seguridad_ciudadana_crossref from "./seguridad-ciudadana/crossref.js";
import * as seguridad_ciudadana_denuncias from "./seguridad-ciudadana/denuncias.js";
import * as seguridad_ciudadana_equipamiento from "./seguridad-ciudadana/equipamiento.js";
import * as seguridad_ciudadana_termometro from "./seguridad-ciudadana/termometro.js";
import * as senace_cartera_proyectos_proyectos from "./senace-cartera-proyectos/proyectos.js";
import * as servicios_salud_crossref from "./servicios-salud/crossref.js";
import * as servicios_salud_ipress from "./servicios-salud/ipress.js";
import * as violencia_escolar_casos from "./violencia-escolar/casos.js";
import * as violencia_escolar_resumen from "./violencia-escolar/resumen.js";

export const MODULOS: Record<string, Record<string, unknown>> = {
  "actividad-agraria/crossref": actividad_agraria_crossref,
  "actividad-agraria/regional-outcome": actividad_agraria_regional_outcome,
  "actividad-agraria/tractor-rental": actividad_agraria_tractor_rental,
  "actividad-agraria/wage": actividad_agraria_wage,
  "actividad-agraria/yunta-rental": actividad_agraria_yunta_rental,
  "actividad-empresarial/crossref": actividad_empresarial_crossref,
  "actividad-empresarial/empresas": actividad_empresarial_empresas,
  "areas-protegidas/areas": areas_protegidas_areas,
  "autoridades-electas/autoridades": autoridades_electas_autoridades,
  "bcrp-comercio-exterior/meta": bcrp_comercio_exterior_meta,
  "bcrp-comercio-exterior/trade": bcrp_comercio_exterior_trade,
  "bcrp-la-libertad/indicadores": bcrp_la_libertad_indicadores,
  "bcrp-la-libertad/meta": bcrp_la_libertad_meta,
  "candidatos-erm/candidatos": candidatos_erm_candidatos,
  "catastro-forestal/crossref": catastro_forestal_crossref,
  "catastro-forestal/titulos": catastro_forestal_titulos,
  "catastro-minero/derechos": catastro_minero_derechos,
  "ceplan-estrategico/crossref": ceplan_estrategico_crossref,
  "ceplan-estrategico/crossref-territorial": ceplan_estrategico_crossref_territorial,
  "ceplan-estrategico/indicators": ceplan_estrategico_indicators,
  "ceplan-estrategico/indicators-execution-efficiency": ceplan_estrategico_indicators_execution_efficiency,
  "ceplan-estrategico/indicators-plan-budget-alignment": ceplan_estrategico_indicators_plan_budget_alignment,
  "ceplan-estrategico/indicators-seg": ceplan_estrategico_indicators_seg,
  "ceplan-estrategico/meta": ceplan_estrategico_meta,
  "ceplan-geo/crossref": ceplan_geo_crossref,
  "ceplan-geo/denominadores": ceplan_geo_denominadores,
  "ceplan-geo/infrastructure": ceplan_geo_infrastructure,
  "ceplan-geo/layers": ceplan_geo_layers,
  "ceplan-geo/patrimonio": ceplan_geo_patrimonio,
  "ceplan-geo/territories": ceplan_geo_territories,
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
  "emergencias-indeci/crossref": emergencias_indeci_crossref,
  "emergencias-indeci/emergencias": emergencias_indeci_emergencias,
  "geo-intersections/intersections": geo_intersections_intersections,
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
  "informes-control/crossref": informes_control_crossref,
  "informes-control/informes": informes_control_informes,
  "infracciones-ambientales/crossref": infracciones_ambientales_crossref,
  "infracciones-ambientales/infracciones": infracciones_ambientales_infracciones,
  "infraestructura-mtc/aerodromos": infraestructura_mtc_aerodromos,
  "infraestructura-mtc/peajes": infraestructura_mtc_peajes,
  "infraestructura-mtc/terminales-portuarios": infraestructura_mtc_terminales_portuarios,
  "infraestructura-mtc/vulnerabilidad": infraestructura_mtc_vulnerabilidad,
  "instituciones-educativas/instituciones": instituciones_educativas_instituciones,
  "instituciones-educativas/resumen": instituciones_educativas_resumen,
  "instituciones-educativas/trayectoria": instituciones_educativas_trayectoria,
  "inversion-privada/crossref": inversion_privada_crossref,
  "inversion-privada/gis": inversion_privada_gis,
  "inversion-privada/meta": inversion_privada_meta,
  "inversion-privada/oxi": inversion_privada_oxi,
  "inversion-privada/projects": inversion_privada_projects,
  "legislativo-congreso/proyectos": legislativo_congreso_proyectos,
  "mimp/cem": mimp_cem,
  "mimp/chat100": mimp_chat100,
  "mindef/offset": mindef_offset,
  "mindef/peace-missions": mindef_peace_missions,
  "mindef/training-abroad": mindef_training_abroad,
  "osinergmin-combustibles/grifos": osinergmin_combustibles_grifos,
  "osinergmin-combustibles/precios": osinergmin_combustibles_precios,
  "ositran-reclamos/recaudacion": ositran_reclamos_recaudacion,
  "ositran-reclamos/reclamos": ositran_reclamos_reclamos,
  "ositran-reclamos/trafico": ositran_reclamos_trafico,
  "poder-judicial/procesos-judiciales": poder_judicial_procesos_judiciales,
  "programas-sociales/cobertura": programas_sociales_cobertura,
  "programas-sociales/crossref": programas_sociales_crossref,
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
  "radar-inversiones/crossref": radar_inversiones_crossref,
  "radar-inversiones/investments": radar_inversiones_investments,
  "radar-inversiones/investments-desactivadas": radar_inversiones_investments_desactivadas,
  "red-vial-subnacional/intervenciones": red_vial_subnacional_intervenciones,
  "renamu/crossref": renamu_crossref,
  "renamu/equipamiento": renamu_equipamiento,
  "renamu/municipalidades": renamu_municipalidades,
  "residuos-solidos/residuos": residuos_solidos_residuos,
  "riesgo-fiscal-isds/mmm": riesgo_fiscal_isds_mmm,
  "salud-institucional/score": salud_institucional_score,
  "seguridad-ciudadana/comisarias": seguridad_ciudadana_comisarias,
  "seguridad-ciudadana/crossref": seguridad_ciudadana_crossref,
  "seguridad-ciudadana/denuncias": seguridad_ciudadana_denuncias,
  "seguridad-ciudadana/equipamiento": seguridad_ciudadana_equipamiento,
  "seguridad-ciudadana/termometro": seguridad_ciudadana_termometro,
  "senace-cartera-proyectos/proyectos": senace_cartera_proyectos_proyectos,
  "servicios-salud/crossref": servicios_salud_crossref,
  "servicios-salud/ipress": servicios_salud_ipress,
  "violencia-escolar/casos": violencia_escolar_casos,
  "violencia-escolar/resumen": violencia_escolar_resumen,
};
