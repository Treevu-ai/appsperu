import { z } from "zod";
import type { AppKey } from "./apps.js";

/**
 * Frase reutilizada al final de cada `description` — recordatorio explícito
 * de que ninguna ingesta tiene scheduler (confirmado buscando
 * cron/schedule/setInterval en todo el repo, sin resultados: ver
 * docs/conectores.md). Sin esto, un agente puede asumir que los datos están
 * al día solo porque la fuente los publica a diario/mensual.
 */
const SIN_SCHEDULER =
  "Ingesta manual, sin scheduler — los datos reflejan la última corrida del conector, no necesariamente el estado actual de la fuente.";

export interface ToolSpec {
  name: string;
  app: AppKey;
  description: string;
  /** Ej. "/api/execution/{entityCode}" — `{param}` se reemplaza por el input del mismo nombre. */
  pathTemplate: string;
  /** Nombres de los `{param}` en `pathTemplate`, en el orden en que aparecen. */
  pathParams: string[];
  /** Query params opcionales salvo que el schema individual los marque requeridos (ver `sanciones`). */
  querySchema: z.ZodRawShape;
}

export const TOOL_CATALOG: ToolSpec[] = [
  // ---- radar-ejecucion (MEF, presupuesto y ejecución de gasto) ----
  {
    name: "radar_ejecucion_execution",
    app: "radar-ejecucion",
    description:
      "Ejecución presupuestal (PIA/PIM/Devengado) por entidad + función + año fiscal, agregada desde el CSV nacional del MEF. " +
      "Cobertura PARCIAL: acotada a La Libertad (offsets fijos en el conector), no todo el país. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/execution",
    pathParams: [],
    querySchema: {
      nivel: z.string().min(1).optional().describe("Nivel de gobierno de la entidad ejecutora (ej. GOBIERNOS REGIONALES)."),
      funcion: z.string().min(1).optional().describe("Código de función de gasto."),
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año fiscal (4 dígitos)."),
      ubigeo: z.string().min(1).optional().describe("Ubigeo de la entidad."),
      departamento: z
        .string()
        .min(1)
        .optional()
        .describe("Departamento de sede de la entidad ejecutora (dónde opera, no a dónde se dirige el gasto)."),
      metaDepartamento: z
        .string()
        .min(1)
        .optional()
        .describe("Departamento AL QUE SE DIRIGE el gasto (DEPARTAMENTO_META), distinto de `departamento`."),
    },
  },
  {
    name: "radar_ejecucion_execution_by_entity",
    app: "radar-ejecucion",
    description: "Detalle de ejecución presupuestal de una entidad específica por su entity_code. " + SIN_SCHEDULER,
    pathTemplate: "/api/execution/{entityCode}",
    pathParams: ["entityCode"],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_benchmark",
    app: "radar-ejecucion",
    description:
      "Compara la ejecución de una entidad contra su cohorte (mismo nivel de gobierno) en un año fiscal dado — " +
      "devuelve 422 si no hay regla de cohorte definida para su nivel_gobierno, en vez de publicar un benchmark sin base. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/benchmark/{entityCode}",
    pathParams: ["entityCode"],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año fiscal (4 dígitos); default el año actual."),
    },
  },
  {
    name: "radar_ejecucion_meta_sources",
    app: "radar-ejecucion",
    description: "Metadata de los últimos 10 lotes de ingesta del MEF (cuándo se corrió, cuántos registros, checksum).",
    pathTemplate: "/api/meta/sources",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_lluvias_seguimiento",
    app: "radar-ejecucion",
    description:
      "Tablero terminal de seguimiento ante lluvias: actividad MEF con PIA/PIM/devengado y, en una sección separada, proyectos territoriales con CUI verificado. " +
      "No une ambas secciones por similitud de nombre ni inventa PIM, CUI o distrito beneficiado. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/lluvias/seguimiento",
    pathParams: [],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año fiscal; omitir para incluir todos los años disponibles."),
      departamento: z.string().min(1).optional().describe("Departamento meta o de sede; por defecto LA LIBERTAD."),
      busqueda: z.string().min(2).max(160).optional().describe("Texto dentro de la actividad u programa presupuestal, ej. DRENAJE."),
    },
  },
  {
    name: "radar_ejecucion_sector_inventory",
    app: "radar-ejecucion",
    description:
      "Inventario de entidades MEF presentes para La Libertad: Gobierno Nacional por destino declarado y Gobierno Regional por sede ejecutora. " +
      "Indica si una entidad ya tiene clasificación sectorial verificada; no clasificada no significa ausente del sector. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/sectores/inventory",
    pathParams: [],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional(),
      departamento: z.string().min(1).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    },
  },
  {
    name: "radar_ejecucion_sector_ficha",
    app: "radar-ejecucion",
    description:
      "Ficha de entidades verificadas de un sector: PIA/PIM/devengado, regla territorial y cortes usados. " +
      "CUI, obra y contratación solo aparecen con claves oficiales exactas; no se infieren por nombre o embeddings. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/sectores/{sectorId}/ficha",
    pathParams: ["sectorId"],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional(),
      departamento: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_sector_comparativo",
    app: "radar-ejecucion",
    description:
      "Comparativo descriptivo de entidades sectoriales verificadas. Mantiene separadas la responsabilidad nacional dirigida al departamento " +
      "y la ejecución regional por sede; no genera score ni suma ambos universos como si fueran uno solo. " + SIN_SCHEDULER,
    pathTemplate: "/api/sectores/comparativo",
    pathParams: [],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional(),
      departamento: z.string().min(1).optional(),
      sectores: z.string().min(1).optional().describe("IDs separados por coma, por ejemplo SALUD,TRANSPORTE."),
    },
  },
  {
    name: "radar_ejecucion_budget_movement",
    app: "radar-ejecucion",
    description:
      "Explicación determinística de cómo se distribuye PIA, PIM y devengado entre Gobierno Nacional dirigido a La Libertad " +
      "y Gobierno Regional ejecutado por sus unidades. No describe pagos, avance físico, impacto ni calidad, y no suma ambos universos. " + SIN_SCHEDULER,
    pathTemplate: "/api/sectores/movimiento-presupuestal",
    pathParams: [],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional(),
      departamento: z.string().min(1).optional(),
      sectores: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_care_services",
    app: "radar-ejecucion",
    description:
      "Registro trazable de servicios que cuidan en La Libertad: infraestructura (CUI y obra INFOBRAS solo por clave exacta) " +
      "y alimentación escolar (cobertura, comités, lotes, proveedores y entregas únicamente cuando una fuente oficial los vincula). " +
      "La ausencia de RUC, lote o entrega se declara como vacío de evidencia; no se infiere por nombres. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados",
    pathParams: [],
    querySchema: {
      tipo: z.enum(["INFRAESTRUCTURA", "ALIMENTACION"]).optional(),
      departamento: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_food_lots",
    app: "radar-ejecucion",
    description:
      "Lotes de alimentación escolar materializados desde evidencia oficial en La Libertad. " +
      "Expone contrato, comité, proveedor literal y RUC únicamente si fue publicado de forma exacta; una referencia de entrega no equivale a acta de recepción escolar. " +
      "Cobertura PARCIAL y manual-asistida: no representa el universo de lotes publicados. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/lotes",
    pathParams: [],
    querySchema: {
      periodo: z.string().regex(/^\d{4}$/).optional(),
      estado: z.enum(["CONTRATO_PUBLICADO", "ENTREGA_REFERIDA_EN_DOCUMENTO", "OBSERVACION_CONTRACTUAL_DOCUMENTADA"]).optional(),
    },
  },
  {
    name: "radar_ejecucion_food_coverage",
    app: "radar-ejecucion",
    description:
      "Cobertura escolar verificable de alimentación. Solo muestra colegio, provincia, distrito y entrega cuando existen código modular y acta/evidencia oficial; " +
      "un total regional agregado no se reparte entre distritos. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/cobertura",
    pathParams: [],
    querySchema: {
      periodo: z.string().regex(/^\d{4}$/).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_food_supplier",
    app: "radar-ejecucion",
    description:
      "Lotes alimentarios y evidencia de cumplimiento consultables por RUC exacto de 11 dígitos. " +
      "No vincula por nombre de consorcio; 404 significa que no existe un vínculo RUC-lote materializado, no una conclusión sobre el proveedor. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/proveedores/{ruc}",
    pathParams: ["ruc"],
    querySchema: { periodo: z.string().regex(/^\d{4}$/).optional() },
  },
  {
    name: "radar_ejecucion_food_integrity",
    app: "radar-ejecucion",
    description:
      "Control de integridad de la cadena lote-RUC-colegio-entrega. Devuelve BLOQUEADO_POR_EVIDENCIA cuando faltan claves o actas; " +
      "no convierte esos vacíos en un indicador de incumplimiento. Con estricto=true usa HTTP 409 para impedir automatizaciones que requieran la cadena completa. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/integridad",
    pathParams: [],
    querySchema: { periodo: z.string().regex(/^\d{4}$/).optional(), estricto: z.enum(["true", "false"]).optional() },
  },
  {
    name: "radar_ejecucion_food_evidence_queue",
    app: "radar-ejecucion",
    description:
      "Cola de evidencia faltante para trazabilidad alimentaria: RUC, padrón de colegios, actas o viabilidad de fuente. " +
      "Es una prioridad de revisión humana, no una lista de observados. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/evidencia-pendiente",
    pathParams: [],
    querySchema: { periodo: z.string().regex(/^\d{4}$/).optional(), estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).optional() },
  },
  {
    name: "radar_ejecucion_supplier_observations",
    app: "radar-ejecucion",
    description:
      "Observaciones documentadas sobre un proveedor, únicamente por RUC exacto: sanción formal, denuncia con expediente, proceso en curso o antigüedad del RUC frente a una fecha contractual. " +
      "No genera score ni concluye responsabilidad; una denuncia o proceso no equivale a sanción. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/observaciones-proveedor/{ruc}",
    pathParams: ["ruc"],
    querySchema: {
      tipo: z.enum(["SANCION_FORMAL", "DENUNCIA_CON_EXPEDIENTE", "PROCESO_EN_CURSO", "ANTIGUEDAD_RUC", "REFERENCIA_EXTERNA"]).optional(),
      estado: z.enum(["VIGENTE", "PRESENTADA", "EN_INVESTIGACION", "ARCHIVADA", "RESUELTA", "CONTEXTO"]).optional(),
    },
  },
  {
    name: "radar_ejecucion_supplier_observations_unlinked",
    app: "radar-ejecucion",
    description:
      "Referencias externas sobre proveedores sin RUC exacto. Se preservan para revisión, pero el sistema prohíbe atribuirlas a un proveedor, lote, contrato o ranking. " + SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/alimentacion/observaciones-proveedor/pendientes",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_tourism_hospedaje",
    app: "radar-ejecucion",
    description:
      "Indicadores MINCETUR de hospedaje (arribos, pernoctaciones) por departamento/mes, fuente Indicadores de Ocupabilidad PNDA. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/turismo/hospedaje",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "radar_ejecucion_tourism_crossref",
    app: "radar-ejecucion",
    description:
      "Cruce turismo: flujo hospedaje MINCETUR vs gasto función TURISMO (MEF), con PIM/devengado MPT Trujillo y separación sede vs meta departamento. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/turismo/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.coerce.number().optional(),
      anioFiscal: z.coerce.number().optional(),
      entidadMpt: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_infrastructure_assets",
    app: "radar-ejecucion",
    description:
      "Activos de infraestructura materializados para La Libertad: CUI/obra cuando existe, y evidencia separada de cierre, operador, mantenimiento, disponibilidad y servicio. " +
      "Avance físico, presupuesto o inauguración no se presentan como operación. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/activos",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional(), sector: z.enum(["DRENAJE", "EDUCACION", "AGUA_SANEAMIENTO", "TRANSPORTE", "RIEGO", "OTRA"]).optional() },
  },
  {
    name: "radar_ejecucion_infrastructure_asset",
    app: "radar-ejecucion",
    description:
      "Ficha completa de un activo: identidad, obra INFOBRAS por CUI exacto, recepción/cierre, operador, mantenimiento, disponibilidad, indicadores y vacíos de evidencia. " +
      "No certifica calidad, seguridad ni impacto. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/activos/{assetId}",
    pathParams: ["assetId"],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_infrastructure_operation",
    app: "radar-ejecucion",
    description:
      "Evidencia de recepción, operador y disponibilidad de un activo. La ausencia de estos registros es un vacío de ALSOL, no prueba de que el activo no funcione. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/activos/{assetId}/operacion",
    pathParams: ["assetId"],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_infrastructure_maintenance",
    app: "radar-ejecucion",
    description:
      "Evidencia de mantenimiento atribuida a un activo. PIM/devengado identifica financiamiento o ejecución registrada, no prueba por sí solo mantenimiento realizado o disponibilidad. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/activos/{assetId}/mantenimiento",
    pathParams: ["assetId"],
    querySchema: { anio: z.string().regex(/^\d{4}$/).optional() },
  },
  {
    name: "radar_ejecucion_infrastructure_integrity",
    app: "radar-ejecucion",
    description:
      "Control de integridad de infraestructura: verifica qué activos tienen cierre, operador, mantenimiento, disponibilidad e indicador. " +
      "Con estricto=true devuelve 409 si no existe evidencia mínima para presentarlos como infraestructura que funciona. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/integridad",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional(), sector: z.enum(["DRENAJE", "EDUCACION", "AGUA_SANEAMIENTO", "TRANSPORTE", "RIEGO", "OTRA"]).optional(), estricto: z.enum(["true", "false"]).optional() },
  },
  {
    name: "radar_ejecucion_infrastructure_evidence_queue",
    app: "radar-ejecucion",
    description:
      "Cola de evidencia faltante por activo: recepción, operador, mantenimiento o disponibilidad. Es una prioridad de revisión, no una lista de infraestructura inoperativa. " + SIN_SCHEDULER,
    pathTemplate: "/api/infraestructura/evidencia-pendiente",
    pathParams: [],
    querySchema: { estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).optional() },
  },
  {
    name: "radar_ejecucion_sector_review_queue",
    app: "radar-ejecucion",
    description:
      "Consulta la cola de candidatos CUI-actividad o entidad-compra pendientes de revisión humana. " +
      "Los candidatos no son vínculos oficiales ni alimentan agregados sectoriales.",
    pathTemplate: "/api/sectores/revision",
    pathParams: [],
    querySchema: {
      estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    },
  },

  // ---- compras-publicas (OECE/OCDS) ----
  {
    name: "compras_publicas_procurement",
    app: "compras-publicas",
    description:
      "Procesos de contratación pública (releases OCDS) ingeridos desde OECE. " +
      "Cobertura PARCIAL: cada corrida trae hasta 10 páginas más recientes, no el histórico completo. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/procurement",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      categoria: z.string().min(1).optional().describe("mainProcurementCategory de OCDS."),
      buyerId: z.string().min(1).optional().describe("ID de la entidad compradora."),
    },
  },
  {
    name: "compras_publicas_procurement_by_ocid",
    app: "compras-publicas",
    description: "Detalle de un proceso de contratación específico por su OCID.",
    pathTemplate: "/api/procurement/{ocid}",
    pathParams: ["ocid"],
    querySchema: {},
  },
  {
    name: "compras_publicas_suppliers",
    app: "compras-publicas",
    description:
      "Proveedores del Estado agregados por adjudicaciones, entidades distintas y valor total, con índice de " +
      "concentración de mercado. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/suppliers",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },
  {
    name: "compras_publicas_supplier_by_id",
    app: "compras-publicas",
    description: "Historial completo de adjudicaciones de un proveedor específico por su supplier_id.",
    pathTemplate: "/api/suppliers/{supplierId}",
    pathParams: ["supplierId"],
    querySchema: {},
  },
  {
    name: "compras_publicas_crossref",
    app: "compras-publicas",
    description:
      "Cruce compras-publicas <-> radar-ejecucion por nombre de entidad (matcher difuso, persistido en " +
      "entity_crosswalk) — trae devengado y compras por entidad ya cruzada. `confidence` filtra confirmada/candidata.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: { confidence: z.enum(["confirmada", "candidata"]).optional() },
  },

  // ---- radar-inversiones (Invierte.pe) ----
  {
    name: "radar_inversiones_investments",
    app: "radar-inversiones",
    description:
      "Proyectos de inversión pública (Invierte.pe) — costos, estado, entidad responsable. " +
      "Cobertura PARCIAL: snapshot por ventana de bytes del CSV, no el archivo completo. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/investments",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      estado: z.string().min(1).optional(),
      situacion: z.string().min(1).optional(),
      funcion: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_inversiones_investment_by_cui",
    app: "radar-inversiones",
    description: "Detalle de un proyecto de inversión específico por su CUI (Código Único de Inversión).",
    pathTemplate: "/api/investments/{cui}",
    pathParams: ["cui"],
    querySchema: {},
  },
  {
    name: "radar_inversiones_crossref",
    app: "radar-inversiones",
    description:
      "Cruce radar-inversiones <-> radar-ejecucion por SEC_EJEC (clave exacta, sin matching difuso) — inversiones " +
      "de un departamento junto con el devengado presupuestal de la misma entidad. Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },

  // ---- infobras (Contraloría) ----
  {
    name: "infobras_public_works",
    app: "infobras",
    description:
      "Obras públicas monitoreadas por la Contraloría (INFOBRAS) — avance físico/financiero, paralización, " +
      "entidad responsable. Cobertura completa (snapshot nacional del XLSX). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/public-works",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      estado: z.string().min(1).optional().describe("estado_ejecucion de la obra."),
      conParalizacion: z.enum(["true", "false"]).optional(),
    },
  },
  {
    name: "infobras_public_works_resumen",
    app: "infobras",
    description: "Resumen agregado: total de obras, % con paralización, % con avance físico reportado.",
    pathTemplate: "/api/public-works/resumen",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },
  {
    name: "infobras_public_work_by_codigo",
    app: "infobras",
    description: "Detalle de una obra específica por su código INFOBRAS.",
    pathTemplate: "/api/public-works/{codigoInfobras}",
    pathParams: ["codigoInfobras"],
    querySchema: {},
  },
  {
    name: "infobras_crossref",
    app: "infobras",
    description:
      "Cruce infobras <-> radar-inversiones por CUI (clave exacta) — obras de un departamento junto con su " +
      "inversión asociada. Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },

  // ---- ceplan-estrategico (ObservaPerú/CEPLAN) ----
  {
    name: "ceplan_estrategico_indicators",
    app: "ceplan-estrategico",
    description:
      "Indicadores priorizados de gestión estratégica del Estado, agregados por nivel de gobierno " +
      "(GN/GR/MP/MD/Total) — NO hay modelo per-entidad disponible públicamente. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/indicators",
    pathParams: [],
    querySchema: {
      indicatorCode: z.string().min(1).optional(),
      nivelGobierno: z.string().min(1).optional(),
    },
  },
  {
    name: "ceplan_estrategico_indicators_seg",
    app: "ceplan-estrategico",
    description:
      "SEG (Strategic Execution Gap): nacional CEPLAN (CUMP03−CUMP02, GN/GR) o proxy departamental " +
      "PROXY_DEPARTAMENTAL (MEF devengado/PIM − avance físico INFOBRAS). Solo 5 regiones piloto ALSOL " +
      "con ?departamento=. Cobertura parcial.",
    pathTemplate: "/api/indicators/seg",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "ceplan_estrategico_indicators_execution_efficiency",
    app: "ceplan-estrategico",
    description:
      "Execution Efficiency: nacional CEPLAN (CUMP02/CUMP03, GN/GR) o proxy departamental " +
      "PROXY_DEPARTAMENTAL (avance físico INFOBRAS / ejecución presupuestal MEF). Solo 5 regiones " +
      "piloto con ?departamento=. Cobertura parcial.",
    pathTemplate: "/api/indicators/execution-efficiency",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "ceplan_estrategico_indicators_plan_budget_alignment",
    app: "ceplan-estrategico",
    description:
      "Plan–Budget Alignment departamental (mapeo heurístico CEPLAN dimensión → función MEF v1). " +
      "Participación % del devengado por dimensión en un departamento piloto. No prueba alineación PEI. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/indicators/plan-budget-alignment",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "ceplan_estrategico_crossref",
    app: "ceplan-estrategico",
    description:
      "Cruce ceplan-estrategico <-> radar-ejecucion por nivel de gobierno (único bucket exacto entre ambas fuentes: " +
      "solo GN/GR, CEPLAN no distingue MP de MD y radar-ejecucion los junta en 'GOBIERNOS LOCALES'). Los años de " +
      "cada fuente pueden no coincidir y se devuelven ambos explícitos.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "ceplan_estrategico_crossref_territorial",
    app: "ceplan-estrategico",
    description:
      "Cruce ceplan-estrategico <-> ceplan-geo por departamento piloto ALSOL (5 regiones). Adjunta CUMP02/CUMP03 " +
      "nacionales (GN/GR) con contexto territorial (distritos, infraestructura). Matcher: departamento_prefijo_ubigeo. " +
      "Cobertura PARCIAL — no implica desempeño estratégico regional.",
    pathTemplate: "/api/crossref/territorial",
    pathParams: [],
    querySchema: { departamento: z.string().min(1) },
  },
  {
    name: "ceplan_estrategico_meta_aplicativo",
    app: "ceplan-estrategico",
    description:
      "Estado del Aplicativo CEPLAN V.01 y fuentes alternativas para datos per-entidad (PEI/POI por pliego). " +
      "Hoy perEntityAvailable=false: ObservaPerú solo trae agregados por nivel de gobierno. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/meta/aplicativo",
    pathParams: [],
    querySchema: {},
  },

  // ---- ceplan-geo (GeoServer CEPLAN, territorio e infraestructura) ----
  {
    name: "ceplan_geo_layers",
    app: "ceplan-geo",
    description:
      "Catálogo de capas WFS ingeridas desde el GeoServer de CEPLAN (PostGIS). Cobertura nacional en capas MVP " +
      "(distritos, aeropuertos, puertos). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/layers",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "ceplan_geo_layer_by_id",
    app: "ceplan-geo",
    description: "Metadatos de una capa geoespacial por UUID interno.",
    pathTemplate: "/api/layers/{id}",
    pathParams: ["id"],
    querySchema: {},
  },
  {
    name: "ceplan_geo_layer_features",
    app: "ceplan-geo",
    description: "Features vectoriales de una capa, con bbox y limit opcionales.",
    pathTemplate: "/api/layers/{id}/features",
    pathParams: ["id"],
    querySchema: {
      bbox: z.string().min(1).optional().describe("minx,miny,maxx,maxy en EPSG:4326."),
      limit: z.string().regex(/^\d+$/).optional(),
    },
  },
  {
    name: "ceplan_geo_territories",
    app: "ceplan-geo",
    description:
      "Distrito/territorio oficial por UBIGEO o por tríada departamento/provincia/distrito. Sin coordenadas inventadas. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/territories",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().regex(/^\d{6}$/).optional(),
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
    },
  },
  {
    name: "ceplan_geo_territories_summary",
    app: "ceplan-geo",
    description:
      "Agregados territoriales por departamento piloto ALSOL (5 regiones): conteo de distritos e infraestructura " +
      "dentro del polígono departamental. Solo LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO.",
    pathTemplate: "/api/territories/summary",
    pathParams: [],
    querySchema: { departamento: z.string().min(1) },
  },
  {
    name: "ceplan_geo_territories_bbox",
    app: "ceplan-geo",
    description: "Territorios (distritos) que intersectan un bounding box.",
    pathTemplate: "/api/territories/bbox",
    pathParams: [],
    querySchema: {
      minx: z.string().regex(/^-?\d+(\.\d+)?$/),
      miny: z.string().regex(/^-?\d+(\.\d+)?$/),
      maxx: z.string().regex(/^-?\d+(\.\d+)?$/),
      maxy: z.string().regex(/^-?\d+(\.\d+)?$/),
    },
  },
  {
    name: "ceplan_geo_infrastructure",
    app: "ceplan-geo",
    description:
      "Infraestructura publicada por CEPLAN: aeropuertos, puertos, red hídrica principal (cb_redhidricaprinx) y " +
      "proyectos sectoriales agro (ip_prysecagr). Filtro opcional por código INEI de departamento (2 dígitos). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/infrastructure",
    pathParams: [],
    querySchema: {
      type: z
        .enum(["aeropuerto", "puerto", "red_hidrica_principal", "proyecto_sectorial_agro"])
        .optional(),
      departamento: z
        .string()
        .regex(/^\d{2}$/)
        .optional()
        .describe("Código INEI de departamento, ej. 13 para La Libertad."),
    },
  },
  {
    name: "ceplan_geo_infrastructure_near",
    app: "ceplan-geo",
    description:
      "Infraestructura (aeropuertos, puertos, red hídrica principal, proyectos sectoriales agro) dentro de un radio " +
      "(km) del centroide del distrito (UBIGEO). Proximidad descriptiva, no causal. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/infrastructure/near",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().regex(/^\d{6}$/),
      radius_km: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      type: z
        .enum(["aeropuerto", "puerto", "red_hidrica_principal", "proyecto_sectorial_agro"])
        .optional(),
    },
  },
  {
    name: "ceplan_geo_crossref_inversiones",
    app: "ceplan-geo",
    description:
      "Cruce ceplan-geo <-> radar-inversiones: enriquece inversiones con territorio CEPLAN e infra cercana. " +
      "Matcher territorial por nombre (la API de inversiones no expone UBIGEO). Requiere radar-inversiones corriendo. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/crossref/inversiones",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },
  {
    name: "ceplan_geo_crossref_obras",
    app: "ceplan-geo",
    description:
      "Cruce ceplan-geo <-> infobras: enriquece obras con territorio CEPLAN sin usar coordenadas (INFOBRAS no las publica). " +
      "Requiere infobras corriendo. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/crossref/obras",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },
  {
    name: "ceplan_geo_crossref_ejecucion",
    app: "ceplan-geo",
    description:
      "Cruce ceplan-geo <-> radar-ejecucion por UBIGEO: ejecución por sede (ubigeo) y gasto nacional dirigido (metaDepartamento) " +
      "en secciones separadas, con infraestructura cercana. No sumar ambos ámbitos. Requiere radar-ejecucion. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/crossref/ejecucion",
    pathParams: [],
    querySchema: { ubigeo: z.string().regex(/^\d{6}$/) },
  },
  {
    name: "ceplan_geo_denominadores_poblacion",
    app: "ceplan-geo",
    description:
      "Población por UBIGEO (piloto provincia Trujillo, Censo INEI 2017) para denominadores territoriales. " + SIN_SCHEDULER,
    pathTemplate: "/api/denominadores/poblacion",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
    },
  },
  {
    name: "ceplan_geo_denominadores_tasas",
    app: "ceplan-geo",
    description:
      "Tasas por distrito dentro de una provincia (ej. denuncias por 1 000 hab.) usando población INEI 2017 y volumen de seguridad-ciudadana. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/denominadores/tasas",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      anio: z.coerce.number().optional(),
      por: z.coerce.number().optional(),
      metrica: z.enum(["denuncias"]).optional(),
    },
  },

  // ---- identidad-fiscal (SUNAT Padrón RUC) ----
  {
    name: "identidad_fiscal_contribuyentes",
    app: "identidad-fiscal",
    description:
      "Busca contribuyentes en el Padrón RUC de SUNAT (personas jurídicas, RUC-20) por razón social, estado o " +
      "ubigeo. Cobertura nacional completa (~2.3M filas). " +
      SIN_SCHEDULER +
      " La fuente SUNAT se actualiza a diario; este conector no está automatizado para seguir ese ritmo.",
    pathTemplate: "/api/contribuyentes",
    pathParams: [],
    querySchema: {
      razonSocial: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE), no requiere coincidencia exacta."),
      estado: z.string().min(1).optional().describe("estado_contribuyente (ej. ACTIVO, BAJA)."),
      ubigeo: z.string().min(1).optional(),
    },
  },
  {
    name: "identidad_fiscal_contribuyente_by_ruc",
    app: "identidad-fiscal",
    description: "Detalle de un contribuyente específico por RUC exacto (11 dígitos).",
    pathTemplate: "/api/contribuyentes/{ruc}",
    pathParams: ["ruc"],
    querySchema: {},
  },
  {
    name: "identidad_fiscal_crossref_proveedores",
    app: "identidad-fiscal",
    description:
      "Cruce identidad-fiscal <-> compras-publicas por RUC exacto (extraído de supplier_id, cobertura ~77.3% de " +
      "adjudicaciones) — marca proveedores con estatus tributario irregular (BAJA/NO HABIDO) que ganaron contratos " +
      "públicos. `soloIrregulares=true` filtra solo esos casos. Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      soloIrregulares: z.enum(["true", "false"]).optional(),
    },
  },
  {
    name: "identidad_fiscal_crossref_entidades",
    app: "identidad-fiscal",
    description:
      "Cruce identidad-fiscal <-> radar-ejecucion por nombre de entidad (matcher difuso, confirmada/candidata) — " +
      "resuelve el RUC de cada gobierno/municipalidad para chequear su propio estatus tributario. Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref/entidades",
    pathParams: [],
    querySchema: { departamento: z.string().min(1).optional() },
  },

  // ---- proveedores-sancionados (RNP/OECE, Tribunal de Contrataciones) ----
  {
    name: "proveedores_sancionados_sanciones",
    app: "proveedores-sancionados",
    description:
      "Inhabilitaciones y multas del Tribunal de Contrataciones para un RUC específico (requerido). " +
      "'Vigente hoy' no equivale a 'vigente al momento de la adjudicación' — revisar fechas `desde`/`hasta` de cada " +
      "registro antes de concluir algo sobre un contrato pasado. Cobertura nacional completa (~17.9K filas). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/sanciones",
    pathParams: [],
    querySchema: { ruc: z.string().regex(/^\d{8,11}$/).describe("RUC de 8 a 11 dígitos. Requerido.") },
  },
  {
    name: "proveedores_sancionados_crossref",
    app: "proveedores-sancionados",
    description:
      "Cruce proveedores-sancionados <-> compras-publicas por RUC exacto — señal más fuerte que el estatus " +
      "tributario: una inhabilitación VIGENTE es prohibición LEGAL de contratar con el Estado. " +
      "`soloInhabilitados=true` filtra solo adjudicaciones con inhabilitación vigente. Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      soloInhabilitados: z.enum(["true", "false"]).optional(),
    },
  },

  // ---- salud-institucional (agregador, sin base propia) ----
  {
    name: "salud_institucional_score",
    app: "salud-institucional",
    description:
      "Score compuesto 0-100 por entidad, calculado EN VIVO combinando ejecución (radar-ejecucion), obras " +
      "(infobras), inversiones (radar-inversiones), compras (compras-publicas) y salud tributaria de proveedores " +
      "(identidad-fiscal). Si una fuente no tiene dato para una entidad, ese componente se OMITE del promedio — " +
      "nunca se imputa 0 ni 100 por ausencia. No hay 'ingesta' propia que programar: requiere que las otras 5 apps " +
      "estén corriendo. Default: LA LIBERTAD, año 2026.",
    pathTemplate: "/api/score",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },

  // ---- actividad-agraria (MIDAGRI, jornal agrícola) ----
  {
    name: "actividad_agraria_wage",
    app: "actividad-agraria",
    description:
      "Valor de jornal agrícola (S/.) por departamento/año/mes, fuente MIDAGRI. Serie mensual normalizada; " +
      "un valor null puede significar 'mes reportado sin dato' ('-' en el origen) o 'mes futuro aún no reportado' — " +
      "ambos casos son indistinguibles en este endpoint. Cobertura nacional completa. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/wage",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año de 4 dígitos."),
    },
  },
  {
    name: "actividad_agraria_regional_outcome",
    app: "actividad-agraria",
    description:
      "Métricas de resultado agropecuario regional (VBP, superficie, productores) — piloto SIEA La Libertad 2024 " +
      "materializado como MANUAL_PILOT hasta existir CSV PNDA equivalente. " + SIN_SCHEDULER,
    pathTemplate: "/api/regional-outcome",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "actividad_agraria_crossref",
    app: "actividad-agraria",
    description:
      "Cruce resultado agro (SIEA piloto) + insumos MIDAGRI (jornal/tractor/yunta) vs gasto AGROPECUARIA en radar-ejecucion, " +
      "separando ejecución con sede regional/local de gasto nacional dirigido (meta_departamento). No sumar ambos ámbitos.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).describe("Requerido."),
      anio: z.string().regex(/^\d{4}$/).describe("Año fiscal de 4 dígitos. Requerido."),
    },
  },
  {
    name: "actividad_agraria_tractor_rental",
    app: "actividad-agraria",
    description:
      "Precio de alquiler de tractor agrícola (S/.) por departamento/año/mes, fuente MIDAGRI-03.04. Misma semántica " +
      "que jornal: null = mes sin dato o futuro no reportado. Cobertura nacional. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/tractor-rental",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año de 4 dígitos."),
    },
  },
  {
    name: "actividad_agraria_yunta_rental",
    app: "actividad-agraria",
    description:
      "Precio de alquiler de yunta (S/.) por departamento/año/mes, fuente MIDAGRI-03.05. Misma semántica " +
      "que jornal: null = mes sin dato o futuro no reportado. Cobertura nacional. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/yunta-rental",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año de 4 dígitos."),
    },
  },

  // ---- seguridad-ciudadana (SIDPOL, MININTER) ----
  {
    name: "seguridad_ciudadana_denuncias",
    app: "seguridad-ciudadana",
    description:
      "Denuncias policiales agregadas (SIDPOL, MININTER) por departamento/provincia/distrito/año/mes/modalidad " +
      "(Robo, Hurto, Extorsión, Estafa, Violencia contra la mujer e integrantes, Secuestro, Otros). Son conteos ya " +
      "agregados por el origen, no eventos individuales. Cobertura nacional completa 2018-2026, sin filtros trae " +
      "el universo entero — usar al menos departamento en producción. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/denuncias",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional().describe("Año de 4 dígitos."),
      modalidad: z.string().min(1).optional(),
    },
  },
  {
    name: "seguridad_ciudadana_crossref",
    app: "seguridad-ciudadana",
    description:
      "Cruce seguridad-ciudadana <-> radar-ejecucion por departamento exacto (sin fuzzy) — total de denuncias del " +
      "año por modalidad junto a la ejecución presupuestal de la función ORDEN PUBLICO Y SEGURIDAD, separando " +
      "ejecución con sede regional/local de gasto de Gobierno Nacional dirigido al departamento. No implica " +
      "causalidad ni correlación entre ambas series.",
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).describe("Requerido."),
      anio: z.string().regex(/^\d{4}$/).describe("Año fiscal de 4 dígitos. Requerido."),
    },
  },

  // ---- bcrp-comercio-exterior (BCRP, balanza comercial nacional) ----
  {
    name: "bcrp_trade",
    app: "bcrp-comercio-exterior",
    description:
      "Comercio exterior agregado nacional (millones US$ FOB) — exportaciones, importaciones y balanza comercial " +
      "mensual, series PN38714BM–PN38723BM. Sin desagregación territorial ni por empresa; indicador macro de contexto. " +
      "Cobertura nacional completa desde 2012. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/trade",
    pathParams: [],
    querySchema: {
      series: z.string().min(1).optional().describe("Clave corta: exportaciones, importaciones, balanza_comercial, etc."),
      anio: z.string().regex(/^\d{4}$/).optional(),
      desde: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Filtro inclusive YYYY-MM."),
      hasta: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Filtro inclusive YYYY-MM."),
    },
  },
  {
    name: "bcrp_meta_sources",
    app: "bcrp-comercio-exterior",
    description: "Metadata de los últimos 10 lotes de ingesta BCRP (series, rango, checksum).",
    pathTemplate: "/api/meta/sources",
    pathParams: [],
    querySchema: {},
  },

  // ---- inversion-privada (PROINVERSIÓN / VERTIX) ----
  {
    name: "inversion_privada_projects",
    app: "inversion-privada",
    description:
      "Cartera de inversión privada PROINVERSIÓN (VERTIX) — proyectos APP y PA con sector, fase, " +
      "titular y monto. Sin CUI; departamento inferido por filtro del buscador. Cobertura completa " +
      "de la cartera consultable. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/projects",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      sector: z.string().min(1).optional(),
      tipo: z.enum(["APP", "PA"]).optional(),
      titular: z.string().min(1).optional(),
      fase: z.string().min(1).optional(),
    },
  },
  {
    name: "inversion_privada_project_by_id",
    app: "inversion-privada",
    description: "Detalle de un proyecto de la cartera VERTIX por su Id interno PROINVERSIÓN.",
    pathTemplate: "/api/projects/{vertixId}",
    pathParams: ["vertixId"],
    querySchema: {},
  },
  {
    name: "inversion_privada_meta_sources",
    app: "inversion-privada",
    description: "Metadata de los últimos lotes de ingesta VERTIX (APP/PA) y OxI, con desglose APP/PA y por fase OxI.",
    pathTemplate: "/api/meta/sources",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "inversion_privada_oxi_projects",
    app: "inversion-privada",
    description:
      "Cartera OxI (Obras por Impuestos) en promoción por PROINVERSIÓN — universo distinto a APP/PA, misma " +
      "plataforma VERTIX. `codigoReferencia` viene de una columna fuente que mezcla tres sistemas de código " +
      "(SNIP / Invierte.pe / IDEA) — no asumir que siempre es un codigo_snip exacto. Cobertura completa del " +
      "export consultado (761 nacional, 55 en La Libertad, verificado 2026-08-28). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/oxi",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      funcion: z.string().min(1).optional(),
      fase: z.string().min(1).optional(),
      entidad: z.string().min(1).optional(),
    },
  },
  {
    name: "inversion_privada_oxi_crossref_invierte",
    app: "inversion-privada",
    description:
      "Cruce OxI <-> radar-inversiones (Invierte.pe) por codigo_snip exacto (sin fuzzy). Solo confirma lo que " +
      "efectivamente matchea — una fila sin match no implica que el proyecto no exista en Invierte.pe, solo " +
      "que su código en OxI no coincidió. Incluye resumen con tasa de match real. Default LA LIBERTAD.",
    pathTemplate: "/api/crossref/oxi",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
    },
  },
  {
    name: "inversion_privada_gis_geojson",
    app: "inversion-privada",
    description:
      "GeoJSON FeatureCollection real y descargable de la cartera VERTIX (endpoint público de " +
      "vertix.proinversion.gob.pe, sin login — a diferencia del visor GIS oficial que sí lo requiere). " +
      "Cruce IDPROYECTO=vertix_id verificado (151/156 exacto). Cobertura completa del feed consultado " +
      "(473 features, verificado 2026-08-28). " + SIN_SCHEDULER,
    pathTemplate: "/api/gis/geojson",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
    },
  },
  {
    name: "inversion_privada_gis_project_geometry",
    app: "inversion-privada",
    description: "Geometría(s) GIS de un proyecto APP/PA específico por su vertix_id (mismo Id de vertixService.php).",
    pathTemplate: "/api/gis/projects/{vertixId}",
    pathParams: ["vertixId"],
    querySchema: {},
  },

  // ---- bcrp-la-libertad (Síntesis de Actividad Económica, BCRP Sucursal Trujillo) ----
  {
    name: "bcrp_la_libertad_indicadores",
    app: "bcrp-la-libertad",
    description:
      "Indicadores mensuales de actividad económica de La Libertad (BCRP Sucursal Trujillo): agropecuario, pesca, " +
      "minería, crédito, depósitos, ejecución presupuestal (anexo=10). A diferencia del resto del catálogo, la " +
      "ingesta de esta fuente es MANUAL — el PDF mensual está detrás de un WAF que bloquea descarga automatizada; " +
      "alguien debe bajarlo con un navegador real y correr `npm run ingest:pdf` (ver ADR-0014). Cobertura parcial " +
      "de anexos: 1,2,3,5,6,8,10 se ingieren correctamente; 4,7,9 usan un layout de tabla ambiguo (separador de " +
      "miles indistinguible de separador de columna) y no se ingieren para evitar datos corruptos silenciosos.",
    pathTemplate: "/api/indicadores",
    pathParams: [],
    querySchema: {
      anexo: z.coerce.number().int().min(1).optional(),
      indicador: z.string().min(1).optional(),
      anio: z.coerce.number().int().optional(),
      mes: z.coerce.number().int().min(1).max(12).optional(),
    },
  },
];
