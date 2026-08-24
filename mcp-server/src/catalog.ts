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
];
