/**
 * Página /docs/api — lista los 82 tools MCP del catálogo de appsperu.
 *
 * En Sprint 11 es estática: importa el catálogo desde
 * `mcp-server/src/catalog.ts` en tiempo de build. Si en Sprint 12+ se
 * quiere leerlo dinámicamente, se reemplaza por un endpoint del MCP.
 *
 * Por ahora, listamos manualmente los 82 nombres (la fuente de verdad
 * es `mcp-server/src/catalog.ts` en el repo). Si agregas un tool al
 * catálogo MCP, agrégalo también aquí.
 */
import { Link } from "react-router-dom";

/**
 * El catálogo de 82 tools vive en `mcp-server/src/catalog.ts` (fuente de
 * verdad). Esta constante es una copia manual para evitar arrastrar una
 * dependencia cruzada al build del frontend.
 *
 * Si agregas o quitas un tool en `mcp-server/src/catalog.ts`, actualiza
 * también este array. El script `scripts/check-mcp-tools-sync.mjs` rompe
 * el build si hay desincronía (no usar throw en runtime — tumba toda la SPA).
 */
const TOOLS: { app: string; name: string; desc: string }[] = [
  // radar-ejecucion (26)
  { app: "radar-ejecucion", name: "radar_ejecucion_execution", desc: "PIA/PIM/Devengado por entidad + función + año." },
  { app: "radar-ejecucion", name: "radar_ejecucion_execution_by_entity", desc: "Detalle de una entidad por entity_code." },
  { app: "radar-ejecucion", name: "radar_ejecucion_benchmark", desc: "Comparación de una entidad contra su cohorte." },
  { app: "radar-ejecucion", name: "radar_ejecucion_meta_sources", desc: "Metadata de los últimos 10 lotes de ingesta MEF." },
  { app: "radar-ejecucion", name: "radar_ejecucion_lluvias_seguimiento", desc: "Seguimiento ante lluvias: actividad MEF + proyectos." },
  { app: "radar-ejecucion", name: "radar_ejecucion_sector_inventory", desc: "Inventario de entidades MEF para La Libertad." },
  { app: "radar-ejecucion", name: "radar_ejecucion_sector_ficha", desc: "Ficha de un sector verificado." },
  { app: "radar-ejecucion", name: "radar_ejecucion_sector_comparativo", desc: "Comparativo descriptivo entre sectores verificados." },
  { app: "radar-ejecucion", name: "radar_ejecucion_budget_movement", desc: "Distribución PIA/PIM/devengado GN vs GR." },
  { app: "radar-ejecucion", name: "radar_ejecucion_care_services", desc: "Servicios que cuidan: infraestructura + alimentación." },
  { app: "radar-ejecucion", name: "radar_ejecucion_food_lots", desc: "Lotes de alimentación escolar materializados." },
  { app: "radar-ejecucion", name: "radar_ejecucion_food_coverage", desc: "Cobertura escolar verificable de alimentación." },
  { app: "radar-ejecucion", name: "radar_ejecucion_food_supplier", desc: "Lotes y cumplimiento por RUC." },
  { app: "radar-ejecucion", name: "radar_ejecucion_food_integrity", desc: "Integridad cadena lote-RUC-colegio-entrega." },
  { app: "radar-ejecucion", name: "radar_ejecucion_food_evidence_queue", desc: "Cola de evidencia faltante para trazabilidad alimentaria." },
  { app: "radar-ejecucion", name: "radar_ejecucion_supplier_observations", desc: "Observaciones documentadas por RUC." },
  { app: "radar-ejecucion", name: "radar_ejecucion_supplier_observations_unlinked", desc: "Referencias externas sin RUC." },
  { app: "radar-ejecucion", name: "radar_ejecucion_tourism_hospedaje", desc: "Indicadores MINCETUR de hospedaje por departamento." },
  { app: "radar-ejecucion", name: "radar_ejecucion_tourism_crossref", desc: "Cruce turismo vs función TURISMO MEF." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_assets", desc: "Activos materializados (CUI, obra, evidencia)." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_asset", desc: "Ficha completa de un activo." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_operation", desc: "Recepción, operador, disponibilidad." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_maintenance", desc: "Evidencia de mantenimiento." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_integrity", desc: "Integridad de infraestructura." },
  { app: "radar-ejecucion", name: "radar_ejecucion_infrastructure_evidence_queue", desc: "Cola de evidencia faltante por activo." },
  { app: "radar-ejecucion", name: "radar_ejecucion_sector_review_queue", desc: "Candidatos pendientes de revisión humana." },
  // compras-publicas (5)
  { app: "compras-publicas", name: "compras_publicas_procurement", desc: "Procesos de contratación OCDS." },
  { app: "compras-publicas", name: "compras_publicas_procurement_by_ocid", desc: "Detalle de un proceso por OCID." },
  { app: "compras-publicas", name: "compras_publicas_suppliers", desc: "Proveedores con índice de concentración." },
  { app: "compras-publicas", name: "compras_publicas_supplier_by_id", desc: "Historial de un proveedor por supplier_id." },
  { app: "compras-publicas", name: "compras_publicas_crossref", desc: "Cruce con radar-ejecucion por nombre de entidad." },
  // radar-inversiones (3)
  { app: "radar-inversiones", name: "radar_inversiones_investments", desc: "Proyectos de inversión pública (Invierte.pe)." },
  { app: "radar-inversiones", name: "radar_inversiones_investment_by_cui", desc: "Detalle de un proyecto por CUI." },
  { app: "radar-inversiones", name: "radar_inversiones_crossref", desc: "Cruce con radar-ejecucion por SEC_EJEC." },
  // infobras (4)
  { app: "infobras", name: "infobras_public_works", desc: "Obras públicas monitoreadas por Contraloría." },
  { app: "infobras", name: "infobras_public_works_resumen", desc: "Resumen agregado de obras." },
  { app: "infobras", name: "infobras_public_work_by_codigo", desc: "Detalle de una obra por código INFOBRAS." },
  { app: "infobras", name: "infobras_crossref", desc: "Cruce con radar-inversiones por CUI." },
  // ceplan-estrategico (7)
  { app: "ceplan-estrategico", name: "ceplan_estrategico_indicators", desc: "Indicadores priorizados agregados por nivel de gobierno." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_indicators_seg", desc: "Strategic Execution Gap nacional o proxy departamental." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_indicators_execution_efficiency", desc: "Eficiencia de ejecución." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_indicators_plan_budget_alignment", desc: "Plan-Budget Alignment departamental." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_crossref", desc: "Cruce con radar-ejecucion por nivel de gobierno." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_crossref_territorial", desc: "Cruce con ceplan-geo por departamento." },
  { app: "ceplan-estrategico", name: "ceplan_estrategico_meta_aplicativo", desc: "Estado del Aplicativo CEPLAN V.01." },
  // ceplan-geo (14)
  { app: "ceplan-geo", name: "ceplan_geo_layers", desc: "Catálogo de capas WFS." },
  { app: "ceplan-geo", name: "ceplan_geo_layer_by_id", desc: "Metadata de una capa." },
  { app: "ceplan-geo", name: "ceplan_geo_layer_features", desc: "Features vectoriales con bbox." },
  { app: "ceplan-geo", name: "ceplan_geo_territories", desc: "Distrito/territorio por UBIGEO o tríada." },
  { app: "ceplan-geo", name: "ceplan_geo_territories_summary", desc: "Agregados territoriales por departamento." },
  { app: "ceplan-geo", name: "ceplan_geo_territories_bbox", desc: "Territorios dentro de un bbox." },
  { app: "ceplan-geo", name: "ceplan_geo_infrastructure", desc: "Infraestructura CEPLAN." },
  { app: "ceplan-geo", name: "ceplan_geo_infrastructure_near", desc: "Infraestructura dentro de un radio (km)." },
  { app: "ceplan-geo", name: "ceplan_geo_crossref_inversiones", desc: "Cruce con radar-inversiones." },
  { app: "ceplan-geo", name: "ceplan_geo_crossref_obras", desc: "Cruce con infobras." },
  { app: "ceplan-geo", name: "ceplan_geo_crossref_ejecucion", desc: "Cruce con radar-ejecucion por UBIGEO." },
  { app: "ceplan-geo", name: "ceplan_geo_denominadores_poblacion", desc: "Población por UBIGEO (INEI 2017)." },
  { app: "ceplan-geo", name: "ceplan_geo_denominadores_tasas", desc: "Tasas por distrito (denominadores)." },
  // identidad-fiscal (4)
  { app: "identidad-fiscal", name: "identidad_fiscal_contribuyentes", desc: "Padrón RUC SUNAT." },
  { app: "identidad-fiscal", name: "identidad_fiscal_contribuyente_by_ruc", desc: "Contribuyente por RUC." },
  { app: "identidad-fiscal", name: "identidad_fiscal_crossref_proveedores", desc: "Cruce con proveedores." },
  { app: "identidad-fiscal", name: "identidad_fiscal_crossref_entidades", desc: "Cruce con entidades." },
  // proveedores-sancionados (2)
  { app: "proveedores-sancionados", name: "proveedores_sancionados_sanciones", desc: "Inhabilitaciones/multas RNP." },
  { app: "proveedores-sancionados", name: "proveedores_sancionados_crossref", desc: "Cruce con identidad-fiscal." },
  // salud-institucional (1)
  { app: "salud-institucional", name: "salud_institucional_score", desc: "Score compuesto por entidad." },
  // actividad-agraria (5)
  { app: "actividad-agraria", name: "actividad_agraria_wage", desc: "Jornal agrícola regional." },
  { app: "actividad-agraria", name: "actividad_agraria_regional_outcome", desc: "Resultado regional." },
  { app: "actividad-agraria", name: "actividad_agraria_crossref", desc: "Cruce con otras apps." },
  { app: "actividad-agraria", name: "actividad_agraria_tractor_rental", desc: "Alquiler de tractor." },
  { app: "actividad-agraria", name: "actividad_agraria_yunta_rental", desc: "Alquiler de yunta." },
  // seguridad-ciudadana (2)
  { app: "seguridad-ciudadana", name: "seguridad_ciudadana_denuncias", desc: "Denuncias SIDPOL." },
  { app: "seguridad-ciudadana", name: "seguridad_ciudadana_crossref", desc: "Cruce con otras apps." },
  // bcrp-comercio-exterior (2)
  { app: "bcrp-comercio-exterior", name: "bcrp_trade", desc: "Comercio exterior nacional BCRP." },
  { app: "bcrp-comercio-exterior", name: "bcrp_meta_sources", desc: "Metadata de ingesta BCRP." },
  // inversion-privada (7)
  { app: "inversion-privada", name: "inversion_privada_projects", desc: "Cartera APP/PA PROINVERSIÓN." },
  { app: "inversion-privada", name: "inversion_privada_project_by_id", desc: "Detalle de un proyecto APP." },
  { app: "inversion-privada", name: "inversion_privada_meta_sources", desc: "Metadata de ingesta." },
  { app: "inversion-privada", name: "inversion_privada_oxi_projects", desc: "Obras por Impuestos." },
  { app: "inversion-privada", name: "inversion_privada_oxi_crossref_invierte", desc: "Cruce OxI con Invierte." },
  { app: "inversion-privada", name: "inversion_privada_gis_geojson", desc: "Capas GIS GeoJSON." },
  { app: "inversion-privada", name: "inversion_privada_gis_project_geometry", desc: "Geometría GIS de un proyecto APP/PA por vertix_id." },
  // bcrp-la-libertad (1)
  { app: "bcrp-la-libertad", name: "bcrp_la_libertad_indicadores", desc: "Síntesis BCRP Sucursal Trujillo (ingesta manual)." },
];

export function DocsApi() {
  const byApp: Record<string, typeof TOOLS> = {};
  for (const t of TOOLS) {
    if (!byApp[t.app]) byApp[t.app] = [];
    byApp[t.app].push(t);
  }
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-accent font-mono">MCP · 82 TOOLS · SOLO LECTURA</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Conectar Rastro desde un agente IA</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Rastro expone un servidor MCP (Model Context Protocol) con {TOOLS.length} tools de solo lectura. Compatible con
        Claude Code, Claude Desktop, Cursor, Windsurf, Cline y Continue.dev. Tu agente encadena los tools, razona sobre
        los resultados y entrega respuestas con citas verificables.
      </p>

      <section className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Claude Code / Cursor / Windsurf</p>
          <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
            <code>{`# Desde el shell
claude mcp add rastro \\
  -- node /ruta/al/repo/mcp-server/dist/index.js

# O en .mcp.json del proyecto
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
    }
  }
}`}</code>
          </pre>
        </div>
        <div className="card">
          <p className="text-xs text-muted font-mono mb-2">Claude Desktop</p>
          <pre className="text-xs bg-ink-950 border border-line rounded-md p-3 overflow-x-auto text-fg-soft">
            <code>{`# ~/Library/Application Support/Claude/
#   claude_desktop_config.json
{
  "mcpServers": {
    "rastro": {
      "command": "node",
      "args": [
        "/ruta/al/repo/mcp-server/dist/index.js"
      ]
    }
  }
}`}</code>
          </pre>
        </div>
      </section>

      <section className="mt-8 card border-accent/30">
        <p className="text-xs text-accent font-mono mb-2">EJEMPLO · UNA SOLA QUERY</p>
        <p className="text-fg text-base">
          "Para los últimos 12 meses: lista proveedores sancionados por la OECE que también ganaron contratos del
          GORE La Libertad en el sector transporte, con valor total adjudicado y % de concentración. Cita cada RUC
          y cada OCID."
        </p>
        <p className="text-fg-soft text-sm mt-3">
          Tu agente invocará secuencialmente:{" "}
          <code className="text-accent">proveedores_sancionados_sanciones</code> →{" "}
          <code className="text-accent">compras_publicas_suppliers</code> (filtrado por La Libertad) →{" "}
          <code className="text-accent">compras_publicas_supplier_by_id</code> (uno por cada RUC) →
          posiblemente <code className="text-accent">compras_publicas_procurement</code> para los OCID. Y te devuelve
          una tabla con citas por RUC, OCID, fuente y corte.
        </p>
      </section>

      <h2 className="font-serif text-2xl text-fg mt-16">Catálogo de los {TOOLS.length} tools</h2>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Catálogo generado manualmente desde{" "}
        <code className="text-fg">mcp-server/src/catalog.ts</code>. Si agregas un tool al catálogo, agrégalo también
        aquí. <strong className="text-warn">Ingesta manual, sin scheduler</strong>: los datos reflejan la última
        corrida del conector, no necesariamente el estado actual de la fuente.
      </p>

      {Object.entries(byApp).map(([app, tools]) => (
        <section key={app} className="mt-10">
          <h3 className="text-fg font-semibold text-lg">{app}</h3>
          <p className="text-xs text-muted">{tools.length} tools</p>
          <ul className="mt-3 divide-y divide-line-soft">
            {tools.map((t) => (
              <li key={t.name} className="py-2 flex flex-col sm:flex-row sm:gap-3">
                <code className="text-accent mono-num text-xs sm:w-72 shrink-0">{t.name}</code>
                <span className="text-fg-soft text-sm">{t.desc}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 text-xs text-muted">
        ¿Falta un tool? → <Link to="/estado" className="text-fg-soft hover:text-accent">revisa el estado de la API</Link>{" "}
        y luego agrégalo en el catálogo MCP.
      </p>
    </div>
  );
}
