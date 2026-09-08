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
    name: "radar_ejecucion_execution_resumen",
    app: "radar-ejecucion",
    description:
      "Agrega PIA/PIM/devengado por función o genérica de gasto (DQ-08, 2026-09-08) sin tener que paginar el " +
      "universo completo y sumar client-side. `groupBy` es requerido (funcion|generica); cualquier otro valor " +
      "responde 400. Acepta los mismos filtros que radar_ejecucion_execution. Verificado en vivo: " +
      "groupBy=funcion para La Libertad da 22 grupos cuya suma de filas es exactamente 2,594 (el total " +
      "departamental). " + SIN_SCHEDULER,
    pathTemplate: "/api/execution/resumen",
    pathParams: [],
    querySchema: {
      groupBy: z.enum(["funcion", "generica"]),
      nivel: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
      ubigeo: z.string().min(1).optional(),
      departamento: z.string().min(1).optional(),
      metaDepartamento: z.string().min(1).optional(),
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
    name: "radar_ejecucion_sector_entidad_ficha",
    app: "radar-ejecucion",
    description:
      "Ficha de UNA entidad específica (por entity_code), distinta de `radar_ejecucion_sector_ficha` (que trae " +
      "todas las entidades verificadas de un sector completo) — mismo detalle (PIA/PIM/devengado, inversiones, " +
      "obras, contrataciones) pero acotado a una sola entidad. No sustituye reglas territoriales ni atribuye " +
      "gasto a CUI por nombre. " + SIN_SCHEDULER,
    pathTemplate: "/api/sectores/entidades/{entityCode}/ficha",
    pathParams: ["entityCode"],
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
    name: "radar_ejecucion_care_service_by_id",
    app: "radar-ejecucion",
    description:
      "Detalle de un servicio específico del registro `radar_ejecucion_care_services` por su serviceId — incluye " +
      "proveedores vinculados (RUC, lote) y evidencia de entrega por colegio, cuando existen. Mismo criterio de " +
      "evidencia que la lista: la ausencia de un dato es un vacío de evidencia, no una conclusión de incumplimiento. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/servicios-cuidados/{serviceId}",
    pathParams: ["serviceId"],
    querySchema: { departamento: z.string().min(1).optional() },
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
  {
    name: "radar_ejecucion_proyectos",
    app: "radar-ejecucion",
    description:
      "Nombre real de proyecto/actividad/obra por entidad+función — el nivel de detalle que responde 'qué " +
      "construye' una entidad, no solo bajo qué función/genérica cae. " + SIN_SCHEDULER,
    pathTemplate: "/api/proyectos",
    pathParams: [],
    querySchema: {
      entityCode: z.string().min(1).optional(),
      funcion: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
      metaDepartamento: z.string().min(1).optional(),
    },
  },
  {
    name: "radar_ejecucion_personal",
    app: "radar-ejecucion",
    description:
      "Dotación de personal del Estado (MEF/AIRHSP) agregada por pliego/unidad ejecutora/régimen laboral/grupo " +
      "ocupacional — cantidad y costo total anual. Agregación institucional, no personal identificable; sin " +
      "ubigeo en la fuente, filtrar por texto sobre PLIEGO/UNIDAD_EJECUTORA. " + SIN_SCHEDULER,
    pathTemplate: "/api/personal",
    pathParams: [],
    querySchema: {
      entidad: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre pliego o unidad ejecutora."),
      ejercicio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "radar_ejecucion_patrimonio_bienes_muebles_baja",
    app: "radar-ejecucion",
    description:
      "Activos patrimoniales dados de baja (desincorporados) por entidad del Estado (MEF) — resolución, acto de " +
      "baja y bien. Solo activos dados de baja, NO es el inventario completo de bienes muebles del Estado (esa " +
      "fuente no tiene un dataset público estructurado conocido). " + SIN_SCHEDULER,
    pathTemplate: "/api/patrimonio/bienes-muebles-baja",
    pathParams: [],
    querySchema: {
      entidad: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre nombre de entidad."),
      ejercicio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "radar_ejecucion_patrimonio_bienes_muebles_baja_por_distrito",
    app: "radar-ejecucion",
    description:
      "Bajas patrimoniales agregadas por distrito, SOLO para municipalidades (el resto del universo — " +
      "ministerios, gobiernos regionales, UGEL, empresas de agua/luz — queda excluido porque su RUC resuelve al " +
      "domicilio fiscal en Lima, no al lugar donde se usó el bien; para una municipalidad, el domicilio fiscal sí " +
      "es una aproximación razonable a su distrito). Cruce en vivo entre esta app, identidad-fiscal (RUC->ubigeo) " +
      "y ceplan-geo (ubigeo->departamento/provincia/distrito), no persistido. " + SIN_SCHEDULER,
    pathTemplate: "/api/patrimonio/bienes-muebles-baja/por-distrito",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      ejercicio: z.string().regex(/^\d{4}$/).optional(),
    },
  },
  {
    name: "radar_ejecucion_burocracia_inversion",
    app: "radar-ejecucion",
    description:
      "Ratio gasto-en-planilla vs. gasto-en-inversión por entidad/distrito (genérica de gasto '1' = personal, " +
      "'6' = adquisición de activos no financieros). Excluye gasto de Gobierno Nacional dirigido a un " +
      "departamento (meta_departamento) y filas sin GENERICA clasificada — no se tratan como cero, se excluyen " +
      "de ambos sumandos. `ratioIndefinido=true` cuando el devengado en inversión es cero (no se puede dividir). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/burocracia-inversion",
    pathParams: [],
    querySchema: {
      anio: z.string().regex(/^\d{4}$/).optional(),
      departamento: z.string().min(1).optional(),
      nivel: z.string().min(1).optional().describe("Nivel de gobierno de la entidad ejecutora."),
      entityCode: z.string().min(1).optional(),
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
  {
    name: "compras_publicas_crossref_salud",
    app: "compras-publicas",
    description:
      "Salud del crossref compras-publicas <-> radar-ejecucion (entity_crosswalk): filas totales, confirmadas, " +
      "candidatas y última construcción. `estado: \"VACIO\"` explícito si no hay filas — usar antes de confiar en " +
      "compras_publicas_crossref para detectar si el crossref se vació de nuevo.",
    pathTemplate: "/api/crossref/salud",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "compras_publicas_unsuccessful_tenders",
    app: "compras-publicas",
    description:
      "Ítems de contratación pública declarados DESIERTO o NULO (dinero convocado, no gastado) — la mitad de " +
      "los procesos OCDS que `compras_publicas_procurement` (adjudicaciones) nunca cubre. No incluye estados " +
      "ambiguos de la fuente (RETROTRAIDO_POR_RESOLUCION, PENDIENTE_DE_REGISTRO_DE_EFECTO, CONVOCADO). " +
      SIN_SCHEDULER,
    pathTemplate: "/api/procurement-sin-adjudicar",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      statusDetails: z.enum(["DESIERTO", "NULO"]).optional(),
      buyerId: z.string().min(1).optional(),
    },
  },
  {
    name: "compras_publicas_bidders_by_ocid",
    app: "compras-publicas",
    description:
      "Participantes (postores) de un proceso de contratación específico por su OCID, con el ganador si lo " +
      "hay. 'Participante' significa que figura en el registro OCDS — no equivale por sí solo a una cotización, " +
      "oferta válida ni comportamiento competitivo.",
    pathTemplate: "/api/bidders/{ocid}",
    pathParams: ["ocid"],
    querySchema: {},
  },
  {
    name: "compras_publicas_bidders_by_provider",
    app: "compras-publicas",
    description:
      "Historial de participaciones de un proveedor como postor (no solo como ganador) — total de procesos, " +
      "victorias y win rate. Cobertura parcial de registros OCDS disponibles en las corridas locales; las tasas " +
      "son descriptivas, no una medición de desempeño o comportamiento.",
    pathTemplate: "/api/bidders/provider/{providerId}",
    pathParams: ["providerId"],
    querySchema: {},
  },
  {
    name: "compras_publicas_bidders_competition",
    app: "compras-publicas",
    description:
      "Top 10 proveedores por victorias, con participaciones/victorias/descalificaciones observadas en la " +
      "muestra ingerida. Resumen descriptivo — no mide competencia, desempeño ni irregularidad. " + SIN_SCHEDULER,
    pathTemplate: "/api/bidders/analytics/competition",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "compras_publicas_bidders_coparticipation",
    app: "compras-publicas",
    description:
      "Pares de proveedores con co-participación repetida (>=3 veces) en los mismos procesos, dentro de la " +
      "muestra disponible. La co-participación puede responder a rubro, zona o periodo compartido — NO " +
      "determina coordinación ni colusión, es solo una descripción de la muestra para investigar con más " +
      "contexto. " + SIN_SCHEDULER,
    pathTemplate: "/api/bidders/analytics/co-participation",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "compras_publicas_entity_profile",
    app: "compras-publicas",
    description:
      "Ficha transversal de una entidad compradora OCDS: resumen de procesos por categoría, adjudicaciones por " +
      "año/moneda, participación de postores por proceso, estado de reconciliación OCID exacto, y si tiene " +
      "contratos menores (SEACE) materializados. Una adjudicación publicada no equivale a contrato firmado, " +
      "pago ejecutado ni entrega recibida — la ficha describe solo el universo materializado, no certifica " +
      "cobertura completa ni ejecución presupuestal.",
    pathTemplate: "/api/entities/{buyerId}/profile",
    pathParams: ["buyerId"],
    querySchema: {},
  },
  {
    name: "compras_publicas_identities",
    app: "compras-publicas",
    description:
      "Relaciones de identidad entre RUC/nombres/identificadores vinculados a una entidad o persona " +
      "(`entity_identity_links`) — busca por cualquier identificador (subject_id o valor origen/destino). Una " +
      "relación candidata no equivale a identidad confirmada; solo las verificadas (`soloVerificadas=true`) " +
      "deberían alimentar cruces automáticos.",
    pathTemplate: "/api/identities",
    pathParams: [],
    querySchema: {
      identifier: z.string().min(1).describe("RUC, subject_id o identificador origen/destino a buscar. Requerido."),
      soloVerificadas: z.enum(["true", "false"]).optional(),
    },
  },
  {
    name: "compras_publicas_conformacion_vinculos",
    app: "compras-publicas",
    description:
      "Personas naturales (DNI enmascarado a los últimos 3 dígitos) que aparecen como socio/representante en " +
      "más de un RUC distinto, y esos RUCs distintos ganaron adjudicaciones en más de una entidad convocante " +
      "distinta. Cruce interno OSCE perfilprov (conformación societaria) + OCDS/menor a 8 UIT. NO implica " +
      "irregularidad por sí solo — es legal que una persona controle o represente varias empresas; es una " +
      "hipótesis para investigar con más contexto, no una conclusión.",
    pathTemplate: "/api/conformacion/vinculos",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "compras_publicas_conformacion_by_ruc",
    app: "compras-publicas",
    description:
      "Conformación societaria de un RUC específico (OSCE — Buscador de Proveedores del Estado): socios, " +
      "representantes y órganos de administración, con DNI/CE enmascarado a los últimos 3 dígitos. Un RUC sin " +
      "socios registrados suele ser un consorcio (Contrato de Colaboración Empresarial), que no tiene " +
      "accionistas en el sentido societario que expone este endpoint — no es un vacío de datos.",
    pathTemplate: "/api/conformacion/{ruc}",
    pathParams: ["ruc"],
    querySchema: {},
  },
  {
    name: "compras_publicas_minor_contracts",
    app: "compras-publicas",
    description:
      "Contrataciones menores a 8 UIT de municipalidades de La Libertad (SEACE, reconstrucción de evidencia " +
      "pública, no el buscador oficial completo) — objeto, monto estimado/adjudicado, cotizaciones recibidas, " +
      "municipalidad y proveedor ganador. Filtra por `signalType` para traer solo contratos con una señal de " +
      "revisión detectada. La ausencia de un dato no prueba incumplimiento. " + SIN_SCHEDULER,
    pathTemplate: "/api/contracts",
    pathParams: [],
    querySchema: {
      year: z.coerce.number().int().min(2026).max(2100).optional(),
      municipalityId: z.string().min(1).optional(),
      supplierId: z.string().min(1).optional(),
      category: z.enum(["goods", "services"]).optional(),
      minAmount: z.coerce.number().min(0).optional(),
      maxAmount: z.coerce.number().min(0).optional().describe("Tope legal vigente: contrataciones menores a 8 UIT."),
      quotationCount: z.coerce.number().int().min(0).optional(),
      signalType: z.enum(["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13"]).optional(),
      q: z.string().min(2).max(200).optional().describe("Búsqueda parcial por objeto, municipalidad, proveedor, RUC u OCID."),
      limit: z.coerce.number().int().min(1).max(500).optional().describe("Default 100."),
    },
  },
  {
    name: "compras_publicas_minor_contract_by_id",
    app: "compras-publicas",
    description:
      "Detalle completo de una contratación menor SEACE: cotizaciones recibidas, eventos, documentos, " +
      "evidencia recolectada y señales de revisión detectadas, con las versiones de normalizador/modelo que " +
      "las generó. La evidencia no localizada en las fuentes consultadas no equivale a incumplimiento.",
    pathTemplate: "/api/contracts/{id}",
    pathParams: ["id"],
    querySchema: {},
  },
  {
    name: "compras_publicas_municipalities",
    app: "compras-publicas",
    description:
      "Municipalidades de La Libertad con contratos menores SEACE materializados — total de contratos, monto " +
      "y proveedores distintos por municipalidad. Búsqueda parcial por nombre/RUC/distrito con `q`.",
    pathTemplate: "/api/municipalities",
    pathParams: [],
    querySchema: {
      q: z.string().min(2).max(200).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional().describe("Default 100."),
    },
  },
  {
    name: "compras_publicas_municipality_by_id",
    app: "compras-publicas",
    description:
      "Ficha de una municipalidad: métricas agregadas de contratos menores, desglose por categoría, top 20 " +
      "proveedores y conteo de señales de revisión detectadas. Las señales son patrones para revisión y no " +
      "determinan irregularidad.",
    pathTemplate: "/api/municipalities/{id}",
    pathParams: ["id"],
    querySchema: {},
  },
  {
    name: "compras_publicas_signals",
    app: "compras-publicas",
    description:
      "Señales de revisión detectadas sobre contrataciones menores SEACE (S01-S13: patrones de fraccionamiento, " +
      "objetos similares, proveedor recurrente, etc.), de la corrida más reciente salvo que se indique " +
      "`signalRunId`. Una señal identifica evidencia y patrones observables — NO determina corrupción, " +
      "favorecimiento, fraccionamiento ni incumplimiento por sí sola.",
    pathTemplate: "/api/signals",
    pathParams: [],
    querySchema: {
      signalType: z.enum(["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "S09", "S10", "S11", "S12", "S13"]).optional(),
      municipalityId: z.string().min(1).optional(),
      supplierId: z.string().min(1).optional(),
      contractingId: z.string().min(1).optional(),
      signalRunId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(500).optional().describe("Default 100."),
    },
  },
  {
    name: "compras_publicas_signal_by_id",
    app: "compras-publicas",
    description:
      "Detalle de una señal de revisión específica: evidencia recolectada y decisiones de revisión humana " +
      "(aprobada/descartada) ya registradas. Identifica un patrón que merece revisión; no determina " +
      "corrupción, favorecimiento, fraccionamiento ni incumplimiento.",
    pathTemplate: "/api/signals/{id}",
    pathParams: ["id"],
    querySchema: {},
  },
  {
    name: "compras_publicas_semantic_review_queue",
    app: "compras-publicas",
    description:
      "Bandeja de pares de contratos comparables por similitud semántica (señales S12/S13) para revisión " +
      "humana, deduplicada por par y priorizada (S13 antes que S12 porque añade el mismo proveedor). Una " +
      "similitud semántica NO determina misma necesidad, favorecimiento, fraccionamiento ni direccionamiento " +
      "— es solo una priorización de qué revisar primero.",
    pathTemplate: "/api/semantic-review-queue",
    pathParams: [],
    querySchema: {
      municipalityId: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional().describe("Default 50."),
    },
  },
  {
    name: "compras_publicas_semantic_review_clusters",
    app: "compras-publicas",
    description:
      "Agrupa señales S12/S13 en clusters de contratos relacionados entre sí (unión de pares transitivos), con " +
      "monto total y similitud máxima del cluster. Igual que la cola de revisión: un cluster resume objetos " +
      "comparables para organizar revisión documental, no determina misma necesidad ni conducta irregular.",
    pathTemplate: "/api/semantic-review-clusters",
    pathParams: [],
    querySchema: { limit: z.coerce.number().int().min(1).max(100).optional().describe("Default 50.") },
  },
  {
    name: "compras_publicas_freshness",
    app: "compras-publicas",
    description:
      "Metadata de frescura por fuente ingerida (OECE/OCDS y SEACE contratos menores): fecha de la última " +
      "corrida, filas totales, id del último batch y filas rechazadas en ese batch. `rejectedInLatestBatch: " +
      "null` significa que esa fuente no trackea rechazos por lote persistido — no que no haya rechazos. Usar " +
      "esto antes de asumir que el dato está al día. " + SIN_SCHEDULER,
    pathTemplate: "/api/meta/freshness",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "compras_publicas_analytics_territorial",
    app: "compras-publicas",
    description:
      "Agregados de contratos menores SEACE de La Libertad por provincia y distrito: total de contratos, " +
      "monto, proveedores distintos, y concentración de mercado (CR1/CR3: % del monto que se lleva el " +
      "proveedor top-1 / top-3). `dateBasis` importa: `source_year` (año declarado en la fuente) y " +
      "`publication_year` (año de publicación) NO son equivalentes.",
    pathTemplate: "/api/analytics/territorial",
    pathParams: [],
    querySchema: {
      year: z.coerce.number().int().min(2020).max(2100).optional().describe("Default 2026."),
      category: z.enum(["goods", "services"]).optional(),
      dateBasis: z.enum(["source_year", "publication_year"]).optional().describe("Default source_year."),
    },
  },
  {
    name: "compras_publicas_analytics",
    app: "compras-publicas",
    description:
      "Indicadores descriptivos y reproducibles sobre contratos menores SEACE, según `kind`: " +
      "'concentration' (proveedores distintos y monto por municipalidad), 'competition' (promedio de " +
      "cotizaciones y contratos con solo 1 cotización válida por municipalidad), 'near-threshold' (contratos " +
      "adjudicados por encima del 90% del tope legal de 8 UIT), 'recurrence' (pares municipalidad-proveedor " +
      "con 2+ contratos), 'evidence' (conteo de evidencia recolectada vs. esperada por contrato). Ninguno " +
      "constituye una conclusión jurídica.",
    pathTemplate: "/api/analytics/{kind}",
    pathParams: ["kind"],
    querySchema: {},
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
  {
    name: "radar_inversiones_investments_desactivadas",
    app: "radar-inversiones",
    description:
      "Inversiones DESACTIVADAS del Banco de Inversiones (MEF) — la mitad del Banco que `radar_inversiones_investments` " +
      "no cubre. `situacion` conserva el estado que tenía la inversión al desactivarse (ej. 'EN FORMULACION' " +
      "cuando nunca obtuvo declaratoria de viabilidad). La fuente no publica un código de motivo por fila; esta " +
      "tool no infiere uno. Paginado real con `total`/`hasMore`, no un LIMIT fijo silencioso. " + SIN_SCHEDULER,
    pathTemplate: "/api/investments-desactivadas",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      situacion: z.string().min(1).optional(),
      funcion: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(5000).optional().describe("Default 1000, máximo 5000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "radar_inversiones_investment_desactivada_by_cui",
    app: "radar-inversiones",
    description: "Detalle de una inversión desactivada específica por su CUI.",
    pathTemplate: "/api/investments-desactivadas/{cui}",
    pathParams: ["cui"],
    querySchema: {},
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
      distritoSospechoso: z
        .enum(["true", "false"])
        .optional()
        .describe(
          "DQ-14: filtra obras cuyo distrito no pertenece al universo real de su departamento (catálogo nacional de 1,874 distritos)."
        ),
    },
  },
  {
    name: "infobras_public_works_resumen",
    app: "infobras",
    description:
      "Resumen agregado: total de obras, % con paralización, % con avance físico reportado, conteo de " +
      "distrito_sospechoso (DQ-14). `groupBy` (DQ-06, 2026-09-08) desglosa por sectorEntidad, " +
      "nivelGobierno, naturalezaObra, modalidadEjecucion o causalParalizacion — antes se ignoraba en " +
      "silencio; un valor no soportado ahora responde 400 explícito.",
    pathTemplate: "/api/public-works/resumen",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      groupBy: z.enum(["sectorEntidad", "nivelGobierno", "naturalezaObra", "modalidadEjecucion", "causalParalizacion"]).optional(),
    },
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
  {
    name: "infobras_crossref_salud",
    app: "infobras",
    description:
      "Salud del crossref infobras <-> radar-ejecucion (entity_crosswalk): filas totales, confirmadas, candidatas " +
      "y última construcción. `estado: \"VACIO\"` explícito si no hay filas — usar antes de confiar en " +
      "infobras_crossref_ejecucion para detectar si el crossref se vació de nuevo.",
    pathTemplate: "/api/crossref/salud",
    pathParams: [],
    querySchema: {},
  },
  {
    name: "infobras_crossref_ejecucion",
    app: "infobras",
    description:
      "Cruce infobras <-> radar-ejecucion por nombre de entidad (matcher difuso, persistido en " +
      "entity_crosswalk, recalculable con `npm run crossref:build`) — trae devengado, obras y obras " +
      "paralizadas por entidad ya cruzada. `confidence` filtra confirmada/candidata.",
    pathTemplate: "/api/crossref/ejecucion",
    pathParams: [],
    querySchema: { confidence: z.enum(["confirmada", "candidata"]).optional() },
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
  {
    name: "ceplan_geo_denominadores_benchmark_ejecucion",
    app: "ceplan-geo",
    description:
      "Ejecución presupuestal (PIM/devengado, solo GOBIERNOS LOCALES) por distrito dentro de una provincia, junto " +
      "con población INEI 2017, para comparar avance de ejecución entre distritos de una misma provincia (evita " +
      "comparar peras con manzanas contra el resto del país). Nunca mezcla gasto nacional dirigido a un " +
      "departamento (`metaDepartamento`) con ejecución por sede — mismo criterio que `ceplan_geo_crossref_ejecucion`. " +
      "PIM=0 con devengado>0 es un caso real de la fuente (visto en Municipalidad Provincial de Trujillo): se " +
      "expone `avancePct: null` + `avancePctIndefinido: true`, nunca una división por cero. Requiere radar-ejecucion. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/denominadores/benchmark-ejecucion",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
    },
  },

  // ---- identidad-fiscal (SUNAT Padrón RUC) ----
  {
    name: "identidad_fiscal_contribuyentes",
    app: "identidad-fiscal",
    description:
      "Busca contribuyentes en el Padrón RUC de SUNAT (personas jurídicas, RUC-20) por razón social, estado o " +
      "ubigeo. Cobertura nacional completa (~2.3M filas) — paginación real: usa `limit`/`offset`; la respuesta " +
      "trae `total` y `hasMore`, no asumas que `resultados` es el universo completo sin revisarlo. " +
      SIN_SCHEDULER +
      " La fuente SUNAT se actualiza a diario; este conector no está automatizado para seguir ese ritmo.",
    pathTemplate: "/api/contribuyentes",
    pathParams: [],
    querySchema: {
      razonSocial: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE), no requiere coincidencia exacta."),
      estado: z.string().min(1).optional().describe("estado_contribuyente (ej. ACTIVO, BAJA)."),
      ubigeo: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
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
  {
    name: "ceplan_geo_patrimonio_predios",
    app: "ceplan-geo",
    description:
      "Predios estatales supervisados por SBN (Superintendencia Nacional de Bienes Estatales) — resultado de " +
      "supervisión, titular, área y si es zona de playa protegida. Cobertura PARCIAL: solo predios efectivamente " +
      "supervisados, NO el universo completo del registro SINABIP (se publica solo como enlace de Google Drive, " +
      "actualmente roto).",
    pathTemplate: "/api/patrimonio/predios",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
    },
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
  {
    name: "proveedores_sancionados_personas",
    app: "proveedores-sancionados",
    description:
      "Cruce persona-a-persona (2026-09-06): ¿una persona sancionada directamente (RUC-10, persona natural) es " +
      "también socio/representante/miembro del órgano de administración de una empresa activa " +
      "(supplier_conformacion, compras-publicas)? El DNI solo se usa como clave de cruce interno — nunca se " +
      "expone completo, `dniEnmascarado` trae solo los últimos 3 dígitos. El nombre sí se expone (ya es público " +
      "en el buscador del RNP y en GET /api/sanciones). `soloVigentes=true` filtra solo personas con una sanción " +
      "vigente hoy. " + SIN_SCHEDULER,
    pathTemplate: "/api/crossref/personas-sancionadas",
    pathParams: [],
    querySchema: {
      soloVigentes: z.enum(["true", "false"]).optional(),
    },
  },
  {
    name: "proveedores_sancionados_redes_proveedores",
    app: "proveedores-sancionados",
    description:
      "Proveedores de contrataciones menores (compras-publicas/SEACE) que ganan en varias municipalidades " +
      "distintas de un departamento — señal de red o concentración territorial, NO una conclusión de " +
      "irregularidad. Solo cuenta municipalidades reales (`official_name ILIKE 'MUNICIPALIDAD%'`), excluyendo " +
      "ministerios/gobiernos regionales/UGEL que también aparecen en el universo de compradores. " +
      "`soloSancionados=true` filtra solo proveedores con inhabilitación VIGENTE hoy (no al momento de cada " +
      "contrato). Default: LA LIBERTAD.",
    pathTemplate: "/api/crossref/redes-proveedores",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Default LA LIBERTAD."),
      minMunicipios: z.coerce.number().int().min(1).optional().describe("Default 2."),
      soloSancionados: z.enum(["true", "false"]).optional(),
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
    name: "bcrp_comercio_exterior_trade",
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
    name: "bcrp_comercio_exterior_meta_sources",
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
    name: "inversion_privada_oxi_by_id",
    app: "inversion-privada",
    description: "Detalle de un proyecto OxI específico por su Id numérico interno (`oxiId`).",
    pathTemplate: "/api/oxi/{oxiId}",
    pathParams: ["oxiId"],
    querySchema: {},
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
  {
    name: "bcrp_la_libertad_meta_sources",
    app: "bcrp-la-libertad",
    description:
      "Metadata de los últimos 10 lotes de ingesta manual (PDF por PDF, ver `bcrp_la_libertad_indicadores`) y " +
      "desglose de filas por anexo — útil para confirmar qué anexos/periodos ya se ingirieron sin tener que " +
      "consultar `indicadores` directamente.",
    pathTemplate: "/api/meta/sources",
    pathParams: [],
    querySchema: {},
  },

  // ---- servicios-salud (RENIPRESS/SUSALUD, establecimientos de salud) ----
  {
    name: "servicios_salud_ipress",
    app: "servicios-salud",
    description:
      "Establecimientos de salud (RENIPRESS/SUSALUD) con su estado operativo real (`ACTIVO` u otro valor tal cual " +
      "lo declara SUSALUD, no normalizado a booleano). Cobertura nacional completa, no acotada a La Libertad — " +
      "paginación real: usa `limit`/`offset`; la respuesta trae `total` y `hasMore`. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/ipress",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().min(1).optional(),
      departamento: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
      estado: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(5000).optional().describe("Default 2000, máximo 5000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "servicios_salud_crossref",
    app: "servicios-salud",
    description:
      "Cruce por UBIGEO entre inversión pública en salud (`investments` de radar-inversiones, FUNCION IN ('SALUD', " +
      "'SALUD Y SANEAMIENTO') — ambos valores confirmados en vivo, no asumidos) y establecimientos RENIPRESS activos. " +
      "Responde si un distrito con inversión en salud tiene o no un IPRESS activo ('puntoCiego'). `investments` hoy " +
      "solo cubre La Libertad — la respuesta declara el alcance territorial real, consultado en vivo en cada request, " +
      "no un valor fijo. " + SIN_SCHEDULER,
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Por defecto LA LIBERTAD."),
      ubigeo: z.string().min(1).optional(),
    },
  },

  // ---- programas-sociales (INFOMIDIS/MIDIS, cobertura de programas sociales) ----
  {
    name: "programas_sociales_cobertura",
    app: "programas-sociales",
    description:
      "Cobertura mensual de programas sociales MIDIS (JUNTOS, WASI MIKUNA/ex-QALI WARMA, FONCODES, CUNAMÁS, CONTIGO, " +
      "PAIS/Tambos y Pensión 65) ya agregada por distrito por el propio MIDIS — nunca un registro individual. " +
      "Cobertura nacional completa, no acotada a La Libertad. Un valor null significa 'sin dato ese corte para ese " +
      "distrito', no cobertura cero. " + SIN_SCHEDULER,
    pathTemplate: "/api/cobertura",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().min(1).optional(),
      fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Formato YYYY-MM-DD."),
    },
  },
  {
    name: "programas_sociales_crossref",
    app: "programas-sociales",
    description:
      "Cruce por UBIGEO entre inversión pública en protección social (`investments` de radar-inversiones, FUNCION IN " +
      "('PROTECCIÓN SOCIAL', 'ASISTENCIA Y PREVISION SOCIAL') — ambos valores confirmados en vivo) y el último corte " +
      "de cobertura INFOMIDIS disponible para ese distrito. Solo lista distritos del lado de `investments` (acotado " +
      "por `departamento`) — `cobertura_social` no trae columna de departamento en su propia fuente. " + SIN_SCHEDULER,
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Por defecto LA LIBERTAD."),
      ubigeo: z.string().min(1).optional(),
    },
  },

  // ---- actividad-empresarial (MTPE, empresas del sector privado por distrito) ----
  {
    name: "actividad_empresarial_empresas",
    app: "actividad-empresarial",
    description:
      "Conteo mensual de empresas activas del sector privado por distrito, fuente MTPE. Cobertura nacional. " +
      "Único año disponible: 2022 — MTPE no ha publicado un corte más reciente bajo este dataset. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/empresas",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().min(1).optional(),
      anio: z.string().regex(/^\d{4}$/).optional(),
      mes: z.coerce.number().int().min(1).max(12).optional(),
    },
  },
  {
    name: "actividad_empresarial_crossref",
    app: "actividad-empresarial",
    description:
      "Cruce descriptivo por UBIGEO entre inversión pública total (`investments` de radar-inversiones, todas las " +
      "funciones — no hay categoría de gasto específica para actividad empresarial) y el conteo de empresas activas " +
      "del corte más reciente disponible (2022). Sin inferencia de causalidad: no incluye ningún campo de 'punto " +
      "ciego' ni etiqueta distritos como deficientes. `investments` hoy solo cubre La Libertad — la respuesta " +
      "declara el alcance territorial real, consultado en vivo. " + SIN_SCHEDULER,
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Por defecto LA LIBERTAD."),
      ubigeo: z.string().min(1).optional(),
    },
  },

  // ---- informes-control (Contraloría, informes de servicios de control) ----
  {
    name: "informes_control_informes",
    app: "informes-control",
    description:
      "Informes de auditoría/servicios de control de la Contraloría (entidad, ubicación, fechas, sector, si tiene " +
      "un hallazgo de responsabilidad). Por diseño, NUNCA expone nombres de funcionarios ni detalle individual de " +
      "responsabilidad — `esConResponsabilidad` es un booleano, no un nombre. Ingesta por año (no todo el histórico " +
      "a la vez); usar `periodo` para acotar. Un año puede superar el `limit` por defecto (hasta ~65K filas) — " +
      "paginación real: usa `limit`/`offset`; la respuesta trae `total` y `hasMore`. " + SIN_SCHEDULER,
    pathTemplate: "/api/informes",
    pathParams: [],
    querySchema: {
      entidad: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE), no exacta."),
      departamento: z.string().min(1).optional(),
      periodo: z.string().regex(/^\d{4}$/).optional(),
      esConResponsabilidad: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().min(1).max(5000).optional().describe("Default 1000, máximo 5000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "informes_control_crossref",
    app: "informes-control",
    description:
      "Cruce por nombre de entidad (fuzzy — la fuente no da un código de entidad compartido) entre informes de " +
      "auditoría de Contraloría y ejecución presupuestal de radar-ejecucion. Devuelve cuántos informes tiene una " +
      "entidad y cuántos de esos tienen un hallazgo de responsabilidad (conteo agregado, nunca un nombre de " +
      "persona) junto a su devengado total. " + SIN_SCHEDULER,
    pathTemplate: "/api/crossref",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Por defecto LA LIBERTAD."),
    },
  },

  // ---- mindef (Ministerio de Defensa, datos abiertos) ----
  {
    name: "mindef_offset_agreements",
    app: "mindef",
    description:
      "Convenios Específicos de Compensaciones Industriales y Sociales Offset del MINDEF: obligaciones de " +
      "compensación que un proveedor extranjero asume como parte de un contrato de defensa (institución, " +
      "entidad contraparte, año de inicio). Dataset pequeño (8 filas confirmadas en vivo) — es todo lo que " +
      "MINDEF publica hoy sobre offsets. " + SIN_SCHEDULER,
    pathTemplate: "/api/offset-agreements",
    pathParams: [],
    querySchema: {
      entidadContraparte: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
    },
  },
  {
    name: "mindef_training_abroad",
    app: "mindef",
    description:
      "Personal militar capacitado en el exterior (institución, curso, país, fechas). `personalCantidad` es un " +
      "conteo por curso, nunca una lista de nombres — el dataset del MEF/MINDEF no publica identificadores " +
      "individuales. " + SIN_SCHEDULER,
    pathTemplate: "/api/training-abroad",
    pathParams: [],
    querySchema: {
      pais: z.string().min(1).optional(),
    },
  },
  {
    name: "mindef_peace_missions",
    app: "mindef",
    description:
      "Personal de las FF.AA. desplegado en Misiones de Paz, Observadores Militares y Contingentes Militares " +
      "(misión, institución, país, año, cantidad). `cantidad` es un conteo agregado por misión/año, no una lista " +
      "de nombres. " + SIN_SCHEDULER,
    pathTemplate: "/api/peace-missions",
    pathParams: [],
    querySchema: {
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
      pais: z.string().min(1).optional(),
    },
  },

  // ---- mimp (Ministerio de la Mujer y Poblaciones Vulnerables, datos abiertos) ----
  {
    name: "mimp_cem_casos",
    app: "mimp",
    description:
      "Casos atendidos por violencia contra la mujer e integrantes del grupo familiar, por Centro Emergencia " +
      "Mujer (CEM) — agregado por centro/año/departamento, desglosado por sexo y tipo de violencia. NUNCA un " +
      "registro individual: se descartó explícitamente el dataset de acogimiento residencial de MIMP por ser " +
      "individual (código de usuario + fecha de nacimiento + tipología de ingreso) sobre menores en protección " +
      "estatal — no se ingiere bajo ninguna circunstancia. " + SIN_SCHEDULER,
    pathTemplate: "/api/cem",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
    },
  },
  {
    name: "mimp_chat100_consultas",
    app: "mimp",
    description:
      "Consultas atendidas por el servicio Chat 100 (línea contra la violencia familiar y sexual) — agregado " +
      "nacional anual por sexo, sin desagregación territorial ni individual en la fuente. " + SIN_SCHEDULER,
    pathTemplate: "/api/chat100",
    pathParams: [],
    querySchema: {
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
    },
  },

  // ---- renamu (Registro Nacional de Municipalidades, INEI, datos abiertos) ----
  {
    name: "renamu_municipalidades",
    app: "renamu",
    description:
      "Identificación de municipalidades (RENAMU/INEI, encuesta censal anual, 1,891 municipalidades) — " +
      "ubigeo, departamento, provincia, distrito, tipo (Provincial/Distrital/Centro Poblado). Alcance " +
      "deliberadamente parcial: el Módulo I completo de la fuente (datos generales) se excluyó por mezclar " +
      "campos institucionales con datos de persona natural del alcalde (nombre, teléfono y correo personal) " +
      "que no se pudieron mapear con certeza contra el diccionario de variables — nunca se ingirió PII. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/municipalidades",
    pathParams: [],
    querySchema: {
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
      departamento: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
      ubigeo: z.string().regex(/^\d{6}$/).optional(),
    },
  },
  {
    name: "renamu_equipamiento",
    app: "renamu",
    description:
      "Capacidad institucional de una municipalidad por ubigeo (RENAMU/INEI, Módulo II: equipamiento y TIC) — " +
      "vehículos (auto, ambulancia, volquete, camión recolector de basura, camión cisterna, grupo electrógeno, " +
      "panel solar) con conteo de unidades operativas/no operativas, y conectividad (líneas fijas/móviles, " +
      "internet, tipo de conexión). Único conector del catálogo que mide capacidad de gestión declarada por la " +
      "propia municipalidad, en vez de ejecución de gasto. No incluye maquinaria pesada, computadoras por tipo " +
      "de procesador ni equipos de oficina en esta primera versión (ver data contract). " + SIN_SCHEDULER,
    pathTemplate: "/api/equipamiento",
    pathParams: [],
    querySchema: {
      ubigeo: z.string().regex(/^\d{6}$/),
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
    },
  },

  // ---- autoridades-electas (JNE, datos abiertos) ----
  {
    name: "autoridades_electas_autoridades",
    app: "autoridades-electas",
    description:
      "Autoridades proclamadas por el JNE (nombre, cargo, organización política, ubigeo, periodo de mandato) — " +
      "no candidatos: `pronunciamiento` es un acta de proclamación oficial real, verificada contra el corte " +
      "2026-07-30 (Presidencia, Senado, Diputados, Parlamento Andino de Elecciones Generales 2026). Sin " +
      "documento de identidad — este conector ingiere deliberadamente solo el recurso del JNE sin DNI; el " +
      "recurso histórico distinto que sí trae DNI sin enmascarar (autoridades regionales/municipales " +
      "2014-2022) NO se ingiere en esta versión. Sin clave única de persona (no hay DNI): el match es por " +
      "nombre completo + cargo + proceso electoral + ubigeo, con riesgo real de colisión por homonimia. " +
      "Paginación real: usa `limit`/`offset`; la respuesta trae `total` y `hasMore`. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/autoridades",
    pathParams: [],
    querySchema: {
      nombre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE) sobre nombre completo."),
      cargo: z.string().min(1).optional(),
      organizacionPolitica: z.string().min(1).optional(),
      ubigeo: z.string().regex(/^\d{6}$/).optional(),
      anioEleccion: z.coerce.number().int().min(2000).max(2100).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },

  // ---- instituciones-educativas (MINEDU/ESCALE, Padrón Web) ----
  {
    name: "instituciones_educativas_instituciones",
    app: "instituciones-educativas",
    description:
      "Padrón nacional de instituciones y programas educativos (MINEDU/ESCALE) — nombre, nivel/modalidad, " +
      "gestión, dirección, ubigeo, coordenadas (lat/lon, único conector del catálogo con georreferenciación " +
      "por establecimiento individual), UGEL, estado operativo. Universo censal completo (180,828 " +
      "instituciones verificadas, no muestra), corte 2026-08-28. Sin datos de persona natural: `DIRECTOR`, " +
      "`TELEFONO`, `EMAIL` y `PROMOTOR` de la fuente real nunca se leen ni persisten — solo `NRORUC`/" +
      "`RZSOCIAL` de instituciones privadas (identidad de entidad, no de persona). Universo nacional de 180K+ " +
      "filas supera ampliamente el `limit` por defecto sin un filtro territorial — paginación real: usa " +
      "`limit`/`offset`; la respuesta trae `total` y `hasMore`. `areaCenso` (Urbana/Rural, DQ-07, 2026-09-08) " +
      "expuesto y filtrable — La Libertad: 4,800 Urbana + 4,591 Rural = 9,391. " + SIN_SCHEDULER,
    pathTemplate: "/api/instituciones",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
      ubigeo: z.string().regex(/^\d{6}$/).optional(),
      estado: z.string().min(1).optional().describe("Ej. 'Activo'."),
      gestion: z.string().min(1).optional(),
      nombre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
      areaCenso: z.enum(["Urbana", "Rural"]).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "instituciones_educativas_resumen",
    app: "instituciones-educativas",
    description:
      "Cobertura educativa agregada por provincia y distrito de un departamento (total de instituciones y " +
      "cuántas están activas) — pensado para no forzar paginar miles de filas de `instituciones_educativas_" +
      "instituciones` cuando lo que se necesita es la cobertura territorial completa. Por defecto LA LIBERTAD " +
      "(84 distritos, 12 provincias, 9,391 instituciones verificadas en vivo). " + SIN_SCHEDULER,
    pathTemplate: "/api/resumen",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional().describe("Por defecto LA LIBERTAD."),
    },
  },

  // ---- infracciones-ambientales (OEFA, RUIAS) ----
  {
    name: "infracciones_ambientales_infracciones",
    app: "infracciones-ambientales",
    description:
      "Registro Único de Infractores Ambientales Sancionados (OEFA) — administrado sancionado, subsector " +
      "económico (minería, industria, hidrocarburos, agricultura, pesquería, residuos sólidos, electricidad, " +
      "consultoras ambientales), ubicación, expediente/resolución, detalle de la infracción, monto de multa. " +
      "`numeroDocumento` se enmascara (últimos 3 dígitos) cuando el administrado es persona natural (D.N.I.) — " +
      "para R.U.C. se expone completo. 14,724 filas nacionales verificadas (610 en La Libertad, 12 " +
      "provincias). Paginación real: usa `limit`/`offset`; la respuesta trae `total` y `hasMore`. " + SIN_SCHEDULER,
    pathTemplate: "/api/infracciones",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
      subsectorEconomico: z.string().min(1).optional(),
      administrado: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },

  // ---- red-vial-subnacional (MTC/Provías Descentralizado) ----
  {
    name: "red_vial_subnacional_intervenciones",
    app: "red-vial-subnacional",
    description:
      "Intervenciones en redes viales departamentales/vecinales (Provías Descentralizado, MTC) — código de " +
      "ruta, tramo, longitud en km, estado de conservación (Bueno/Regular/Malo), tipo de superficie, tipo de " +
      "intervención (mantenimiento/mejoramiento/conservación), responsable. Nivel de detalle: ruta/tramo dentro " +
      "de una provincia, no distrito exacto (una ruta puede cruzar más de uno). Nombres de provincia con tildes " +
      "inconsistentes en la fuente real (ej. 'VIRU' y 'VIRÚ' como valores distintos) — no normalizado. 12,536 " +
      "filas nacionales verificadas (461 en La Libertad, 12 provincias). Paginación real: usa `limit`/`offset`; " +
      "la respuesta trae `total` y `hasMore`. " + SIN_SCHEDULER,
    pathTemplate: "/api/intervenciones",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      estado: z.string().min(1).optional().describe("Ej. 'BUENO', 'MALO'."),
      codigoRuta: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },

  // ---- residuos-solidos (MINAM, SIGERSOL) ----
  {
    name: "residuos_solidos_residuos",
    app: "residuos-solidos",
    description:
      "Generación anual de residuos sólidos domiciliarios y municipales por distrito (MINAM/SIGERSOL) — " +
      "población INEI, generación per cápita, toneladas/día y toneladas/año. Serie histórica real 2019-2024 " +
      "(6 años, 11,310 filas nacionales, 500 en La Libertad). Sin `anio` ni `historico=true`, filtra al año " +
      "más reciente por defecto (DQ-04, 2026-09-08) — antes mezclaba los 6 años, sobreestimando cualquier " +
      "total agregado ~6x. `historico=true` recupera la serie completa; `anio=YYYY` filtra a un año exacto. " +
      "Paginación real: usa `limit`/`offset`; la respuesta trae `total` y `hasMore`. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/residuos",
    pathParams: [],
    querySchema: {
      departamento: z.string().min(1).optional(),
      provincia: z.string().min(1).optional(),
      distrito: z.string().min(1).optional(),
      ubigeo: z.string().regex(/^\d{6}$/).optional(),
      anio: z.coerce.number().int().min(2000).max(2100).optional(),
      historico: z.enum(["true", "false"]).optional().describe("true trae todos los años (DQ-04); default: solo el más reciente."),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 200, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },

  // ---- infraestructura-mtc (MTC: terminales portuarios, aeródromos, peajes) ----
  {
    name: "infraestructura_mtc_terminales_portuarios",
    app: "infraestructura-mtc",
    description:
      "Catálogo de terminales portuarios y embarcaderos (MTC) — ubicación, ámbito (marítimo/fluvial/" +
      "lacustre), tipo, uso, tráfico, estado de conservación, titularidad y administrador. Panel multi-corte " +
      "2022-2025 (507 filas nacionales), pero sin `fechaCorte` ni `historico=true` filtra al corte más " +
      "reciente por defecto (DQ-03, 2026-09-08) — La Libertad vigente: 2 terminales (antes mezclaba hasta 4 " +
      "cortes y devolvía 9 filas, incluyendo TP Chicama/Malabrigo ya dado de baja). `historico=true` recupera " +
      "todos los cortes; `fechaCorte=YYYY-MM-DD` filtra a uno exacto. Paginación real: usa `limit`/`offset`; " +
      "la respuesta trae `total` y `hasMore`. " + SIN_SCHEDULER,
    pathTemplate: "/api/terminales-portuarios",
    pathParams: [],
    querySchema: {
      idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
      ambito: z.string().min(1).optional(),
      estado: z.string().min(1).optional(),
      fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Corte exacto YYYY-MM-DD."),
      historico: z.enum(["true", "false"]).optional().describe("true trae todos los cortes (DQ-03); default: solo el más reciente."),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 500, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "infraestructura_mtc_aerodromos",
    app: "infraestructura-mtc",
    description:
      "Catálogo de infraestructura aeroportuaria/aeródromos (MTC) — ubicación, tipo, código OACI, escala, " +
      "estado, jerarquía, titularidad y administrador. La columna ID original de la fuente viene con el " +
      "literal '#¡REF!' (error de fórmula de Excel) en el corte 2025 — no se usa; la clave real es " +
      "codigoAerodromo. Panel multi-corte 2022-2025 (595 filas nacionales), pero sin `fechaCorte` ni " +
      "`historico=true` filtra al corte más reciente por defecto (DQ-03, 2026-09-08) — vigente: 152 " +
      "nacionales, 9 en La Libertad (incluye el Aeropuerto Internacional Cap. FAP Carlos Martínez de " +
      "Pinillos en Trujillo). `historico=true` recupera todos los cortes (595); `fechaCorte=YYYY-MM-DD` " +
      "filtra a uno exacto. Paginación real: usa `limit`/`offset` y revisa `hasMore`. " +
      SIN_SCHEDULER,
    pathTemplate: "/api/aerodromos",
    pathParams: [],
    querySchema: {
      idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
      provincia: z.string().min(1).optional(),
      tipoAerodromo: z.string().min(1).optional(),
      fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Corte exacto YYYY-MM-DD."),
      historico: z.enum(["true", "false"]).optional().describe("true trae todos los cortes (DQ-03); default: solo el más reciente."),
      limit: z.coerce.number().int().min(1).max(1000).optional().describe("Default 500, máximo 1000."),
      offset: z.coerce.number().int().min(0).optional().describe("Default 0."),
    },
  },
  {
    name: "infraestructura_mtc_peajes",
    app: "infraestructura-mtc",
    description:
      "Catálogo de unidades de peaje de la red vial nacional (MTC) — ubicación, código de ruta, km de inicio, " +
      "titularidad, administrador y estado operativo. Panel multi-corte (233 features nacionales, 3 cortes " +
      "2024-12-30 a 2025-12-31), pero sin `fechaCorte` ni `historico=true` filtra al corte más reciente por " +
      "defecto (DQ-03, 2026-09-08) — vigente: 78 nacionales, 5 en La Libertad (Menocucho, Virú, Pacanguilla, " +
      "Chicama, Ciudad de Dios). `historico=true` recupera todos los cortes; `fechaCorte=YYYY-MM-DD` filtra a " +
      "uno exacto. " + SIN_SCHEDULER,
    pathTemplate: "/api/peajes",
    pathParams: [],
    querySchema: {
      idDepartamento: z.string().min(1).optional().describe("Código UBIGEO de departamento, ej. '13' para La Libertad."),
      codigoRuta: z.string().min(1).optional(),
      estado: z.string().min(1).optional(),
      fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Corte exacto YYYY-MM-DD."),
      historico: z.enum(["true", "false"]).optional().describe("true trae todos los cortes (DQ-03); default: solo el más reciente."),
    },
  },
];
