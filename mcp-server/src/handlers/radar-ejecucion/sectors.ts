import type { NeonRow, NeonPool } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

/** Paridad con `apps/infobras/api/src/signals/signals.ts` — no importar la app infobras. */
function gapFisicoFinanciero(avanceFisicoRealPct: number | null, ejecucionFinancieraPct: number | null): number | null {
  if (avanceFisicoRealPct === null || ejecucionFinancieraPct === null) return null;
  return Math.round((avanceFisicoRealPct - ejecucionFinancieraPct) * 100) / 100;
}

/** Port de `@appsperu/shared-signals` `costDriftPct`. */
function costDriftPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable === 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 10000) / 100;
}

type ScopeRule = "META_DEPARTAMENTO" | "SEDE_EJECUTORA";
function scopeLabel(rule: ScopeRule): string {
  return rule === "META_DEPARTAMENTO" ? "Gasto nacional dirigido al departamento" : "Ejecución de unidad con sede regional";
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function number(value: unknown): number {
  return Number(value ?? 0);
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (item instanceof Date ? item.toISOString().slice(0, 10) : String(item))) : [];
}
function money(value: unknown): number {
  return Math.round(number(value) * 100) / 100;
}

type BudgetRow = {
  sector_id: string;
  sector_nombre: string;
  entity_code: string;
  entity_name_publicado: string;
  entity_kind: string;
  nivel_gobierno: string;
  scope_rule: ScopeRule;
  pia: string | number;
  pim: string | number;
  devengado: string | number;
  cortes: unknown;
  resource_ids: unknown;
  estado_cobertura: string | null;
  cobertura_corte: string | Date | null;
  cobertura_registros: string | number | null;
};

function mapInfobrasWork(row: Record<string, unknown>) {
  const montoViable = nullableNumber(row.monto_viable);
  const costoActualizado = nullableNumber(row.costo_actualizado);
  const avanceFisicoRealPct = nullableNumber(row.avance_fisico_real_pct);
  const ejecucionFinancieraPct = nullableNumber(row.ejecucion_financiera_pct);

  return {
    codigoInfobras: row.codigo_infobras,
    cui: row.cui,
    nombre: row.nombre_obra,
    estadoEjecucion: row.estado_ejecucion,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    avanceFisicoRealPct,
    ejecucionFinancieraPct,
    existeParalizacion: row.existe_paralizacion,
    diasParalizado: nullableNumber(row.dias_paralizado),
    fechaParalizacion: row.fecha_paralizacion ?? null,
    costDriftPct: costDriftPct(montoViable, costoActualizado),
    gapFisicoFinanciero: gapFisicoFinanciero(avanceFisicoRealPct, ejecucionFinancieraPct),
  };
}

async function budgetByRegistry(
  db: NeonPool,
  anio: number,
  departamento: string,
  ambitoNacional: boolean,
  sectorId?: string,
  entityCode?: string
): Promise<BudgetRow[]> {
  const params: unknown[] = ambitoNacional ? [anio] : [anio, departamento];
  const filters = ["r.verification_status = 'VERIFICADO'"];
  if (sectorId) {
    params.push(sectorId.toUpperCase());
    filters.push(`r.sector_id = $${params.length}`);
  }
  if (entityCode) {
    params.push(entityCode);
    filters.push(`r.entity_code = $${params.length}`);
  }

  const budgetJoinCondition = ambitoNacional
    ? ""
    : `AND ((r.scope_rule='META_DEPARTAMENTO' AND b.meta_departamento=$2)
          OR (r.scope_rule='SEDE_EJECUTORA' AND b.meta_departamento IS NULL))`;

  const coverageJoin = ambitoNacional
    ? "LEFT JOIN budget_coverage_snapshots s ON false"
    : `LEFT JOIN budget_coverage_snapshots s ON s.activo=true AND s.anio_fiscal=$1 AND s.departamento=$2
        AND s.nivel_gobierno=r.nivel_gobierno
        AND s.origen_cobertura=CASE WHEN r.scope_rule='META_DEPARTAMENTO' THEN 'META_DEPARTAMENTO' ELSE 'SEDE_EJECUTORA' END`;

  const { rows } = await db.query<BudgetRow>(
    `${LATEST_BUDGET_CTE}
     SELECT r.sector_id,r.sector_nombre,r.entity_code,r.entity_name_publicado,r.entity_kind,r.nivel_gobierno,r.scope_rule,
            COALESCE(SUM(b.pia),0) AS pia,COALESCE(SUM(b.pim),0) AS pim,COALESCE(SUM(b.devengado),0) AS devengado,
            COALESCE(array_agg(DISTINCT b.fecha_corte) FILTER (WHERE b.fecha_corte IS NOT NULL), ARRAY[]::date[]) AS cortes,
            COALESCE(array_agg(DISTINCT rb.resource_id) FILTER (WHERE rb.resource_id IS NOT NULL), ARRAY[]::text[]) AS resource_ids,
            s.estado_cobertura, s.fecha_corte AS cobertura_corte, s.record_count AS cobertura_registros
       FROM sector_entity_registry r
  LEFT JOIN latest_budget b ON b.entity_code=r.entity_code AND b.anio_fiscal=$1 ${budgetJoinCondition}
  LEFT JOIN raw_mef_batches rb ON rb.id=b.source_batch_id
  ${coverageJoin}
      WHERE ${filters.join(" AND ")}
      GROUP BY r.sector_id,r.sector_nombre,r.entity_code,r.entity_name_publicado,r.entity_kind,r.nivel_gobierno,r.scope_rule,
               s.estado_cobertura,s.fecha_corte,s.record_count
      ORDER BY r.sector_id,r.entity_name_publicado`,
    params
  );
  return rows;
}

async function projectsForEntities(db: NeonPool, entityCodes: string[]) {
  if (entityCodes.length === 0) return [];
  const { rows } = await db.query<NeonRow>(
    `SELECT p.cui,p.actividad_literal,p.entidad_responsable,p.departamento,p.pia_legal,p.pim,p.devengado,p.estado_pim,
            p.alerta_consistencia_territorial,p.observed_at,l.entity_code,l.evidence_url
       FROM project_evidence_links p
       JOIN project_budget_links l ON l.cui=p.cui
      WHERE l.link_status='VINCULO_OFICIAL' AND l.entity_code=ANY($1)
      ORDER BY p.cui`,
    [entityCodes]
  );
  return rows.map((row) => ({
    cui: row.cui, actividad: row.actividad_literal, entidadResponsable: row.entidad_responsable,
    departamento: row.departamento, piaLegal: row.pia_legal === null ? null : number(row.pia_legal),
    pim: row.pim === null ? null : number(row.pim), devengado: row.devengado === null ? null : number(row.devengado),
    estadoPim: row.estado_pim, entityCode: row.entity_code, evidenceUrl: row.evidence_url,
    alertaConsistenciaTerritorial: row.alerta_consistencia_territorial, fechaObservacion: row.observed_at,
  }));
}

async function worksForCuis(cuis: string[], infobrasDb: NeonPool | null) {
  if (cuis.length === 0) return { estado: "SIN_CUI_CON_VINCULO_OFICIAL", resultados: [] as unknown[] };
  if (!infobrasDb) return { estado: "INFOBRAS_NO_CONFIGURADO", resultados: [] as unknown[] };
  const { rows } = await infobrasDb.query<NeonRow>(
    `SELECT codigo_infobras,cui,nombre_obra,estado_ejecucion,departamento,provincia,distrito,
            avance_fisico_real_pct,ejecucion_financiera_pct,existe_paralizacion,
            dias_paralizado,fecha_paralizacion,monto_viable,costo_actualizado
       FROM public_works WHERE cui=ANY($1) ORDER BY codigo_infobras`,
    [cuis]
  );
  return { estado: "CUI_EXACTO", resultados: rows.map((row) => mapInfobrasWork(row as Record<string, unknown>)) };
}

async function procurementForEntities(entityCodes: string[], comprasDb: NeonPool | null) {
  if (entityCodes.length === 0) return { estado: "SIN_ENTIDADES_VERIFICADAS", resultados: [] as unknown[] };
  if (!comprasDb) return { estado: "COMPRAS_NO_CONFIGURADO", resultados: [] as unknown[] };
  const { rows: identities } = await comprasDb.query<NeonRow>(
    `SELECT DISTINCT subject_id FROM entity_identity_links
      WHERE strength IN ('EXACTA','VERIFICADA')
        AND ((source_identifier_type='MEF_ENTITY_CODE' AND source_identifier_value=ANY($1))
          OR (target_identifier_type='MEF_ENTITY_CODE' AND target_identifier_value=ANY($1)))`,
    [entityCodes]
  );
  const municipalityIds = identities.map((row) => row.subject_id);
  if (municipalityIds.length === 0) return { estado: "SIN_VINCULO_MEF_COMPRAS_VERIFICADO", resultados: [] as unknown[] };
  const { rows } = await comprasDb.query<NeonRow>(
    `SELECT c.contracting_id,c.ocid,c.award_id,c.object_original,c.awarded_amount,c.publication_date,c.award_date,
            m.official_name,m.province,m.district,c.source_url
       FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id
      WHERE c.municipality_id=ANY($1) ORDER BY c.publication_date DESC NULLS LAST LIMIT 200`,
    [municipalityIds]
  );
  return {
    estado: "IDENTIDAD_MEF_COMPRAS_VERIFICADA",
    resultados: rows.map((row) => ({
      contractingId: row.contracting_id, ocid: row.ocid, awardId: row.award_id, objeto: row.object_original,
      montoAdjudicado: row.awarded_amount === null ? null : number(row.awarded_amount), publicationDate: row.publication_date,
      awardDate: row.award_date, entidadCompradora: row.official_name, provincia: row.province, distrito: row.district, fuenteUrl: row.source_url,
    })),
  };
}

function mapBudget(row: BudgetRow) {
  const pim = number(row.pim);
  const devengado = number(row.devengado);
  return {
    sectorId: row.sector_id, sector: row.sector_nombre, entityCode: row.entity_code, entidad: row.entity_name_publicado,
    tipoEntidad: row.entity_kind, nivelGobierno: row.nivel_gobierno, reglaTerritorial: row.scope_rule,
    alcance: scopeLabel(row.scope_rule), pia: money(row.pia), pim: money(pim), devengado: money(devengado),
    saldoPorDevengar: pim >= devengado ? money(pim - devengado) : null,
    cobertura: { estado: row.estado_cobertura ?? "NO_VERIFICADA", fechaCorteParticion: row.cobertura_corte, registrosParticion: row.cobertura_registros === null ? null : number(row.cobertura_registros) },
    cortesUsados: stringArray(row.cortes), recursos: stringArray(row.resource_ids),
  };
}

type MovementRow = {
  sectorId: string; sector: string; entidad: string; reglaTerritorial: ScopeRule;
  pia: number; pim: number; devengado: number; cortesUsados: string[];
};
type Universe = "NACIONAL_DIRIGIDO" | "REGIONAL_EJECUTADO";
function movementRound(value: number): number { return Math.round(value * 100) / 100; }
function soles(value: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value);
}
function universeOf(row: MovementRow): Universe {
  return row.reglaTerritorial === "META_DEPARTAMENTO" ? "NACIONAL_DIRIGIDO" : "REGIONAL_EJECUTADO";
}
function universeLabel(universe: Universe): string {
  return universe === "NACIONAL_DIRIGIDO" ? "Gobierno Nacional dirigido a La Libertad" : "Gobierno Regional La Libertad ejecutado por sus unidades";
}
function summarizeBudgetMovement(rows: MovementRow[]) {
  const groups = new Map<Universe, MovementRow[]>();
  for (const row of rows) {
    const universe = universeOf(row);
    groups.set(universe, [...(groups.get(universe) ?? []), row]);
  }
  const universes = (["NACIONAL_DIRIGIDO", "REGIONAL_EJECUTADO"] as const)
    .map((universe) => {
      const members = groups.get(universe) ?? [];
      const pia = movementRound(members.reduce((sum, row) => sum + row.pia, 0));
      const pim = movementRound(members.reduce((sum, row) => sum + row.pim, 0));
      const devengado = movementRound(members.reduce((sum, row) => sum + row.devengado, 0));
      const avancePct = pim > 0 ? movementRound((devengado / pim) * 100) : null;
      const variacionPimPia = movementRound(pim - pia);
      const topEntidades = [...members]
        .sort((a, b) => b.pim - a.pim || a.entidad.localeCompare(b.entidad))
        .slice(0, 3)
        .map((row) => ({
          sectorId: row.sectorId, sector: row.sector, entidad: row.entidad, pim: row.pim, devengado: row.devengado,
          avancePct: row.pim > 0 ? movementRound((row.devengado / row.pim) * 100) : null,
        }));
      return { universo: universe, etiqueta: universeLabel(universe), entidades: members.length, pia, pim, devengado, avancePct, variacionPimPia, topEntidades };
    })
    .filter((item) => item.entidades > 0);

  const bySector = new Map<string, MovementRow[]>();
  for (const row of rows) {
    const key = `${row.sectorId}:${universeOf(row)}`;
    bySector.set(key, [...(bySector.get(key) ?? []), row]);
  }
  const sectores = [...bySector.values()]
    .map((members) => {
      const first = members[0];
      const pim = movementRound(members.reduce((sum, row) => sum + row.pim, 0));
      const devengado = movementRound(members.reduce((sum, row) => sum + row.devengado, 0));
      return { sectorId: first.sectorId, sector: first.sector, universo: universeOf(first), pim, devengado, avancePct: pim > 0 ? movementRound((devengado / pim) * 100) : null };
    })
    .sort((a, b) => b.pim - a.pim || a.sector.localeCompare(b.sector));

  const narrativa = universes.map((item) => {
    const movement = item.variacionPimPia === 0 ? "se mantuvo igual al PIA" : item.variacionPimPia > 0 ? `aumentó ${soles(item.variacionPimPia)} frente al PIA` : `disminuyó ${soles(Math.abs(item.variacionPimPia))} frente al PIA`;
    const execution = item.avancePct === null ? "no tiene PIM publicado para calcular avance" : `ha devengado ${soles(item.devengado)} (${item.avancePct}% del PIM)`;
    return `${item.etiqueta}: ${item.entidades} entidades verificadas registran ${soles(item.pim)} de PIM; ${movement} y ${execution}.`;
  });

  return {
    universos: universes,
    sectores,
    narrativa,
    limitacion: "Describe presupuesto y devengado registrados en el alcance materializado. Devengado no equivale necesariamente a pago, avance físico, beneficio entregado ni calidad del gasto; los universos nacional y regional no se suman como una sola bolsa.",
  };
}

function baseArgs(args: Record<string, unknown>) {
  return {
    anio: args.anio !== undefined ? Number(args.anio) : 2026,
    departamento: (args.departamento as string | undefined) ?? "LA LIBERTAD",
    ambito: (args.ambito as string | undefined) ?? "REGIONAL",
  };
}

/**
 * Handler para `radar_ejecucion_sector_inventory` — GET /api/sectores/inventory.
 */
export async function inventory(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const { anio, departamento: dep } = baseArgs(args);
  const limit = args.limit !== undefined ? Number(args.limit) : 100;
  const departamento = dep.toUpperCase();

  const { rows } = await db.query<NeonRow>(
    `${LATEST_BUDGET_CTE}
     SELECT DISTINCT e.entity_code,e.nombre,e.nivel_gobierno,
            CASE WHEN e.nivel_gobierno='GOBIERNO NACIONAL' THEN 'META_DEPARTAMENTO' ELSE 'SEDE_EJECUTORA' END AS regla_territorial,
            EXISTS(SELECT 1 FROM sector_entity_registry r WHERE r.entity_code=e.entity_code AND r.verification_status='VERIFICADO') AS clasificado
       FROM latest_budget b JOIN entities e ON e.entity_code=b.entity_code
       LEFT JOIN territories t ON t.ubigeo=e.ubigeo
      WHERE b.anio_fiscal=$1 AND ((e.nivel_gobierno='GOBIERNO NACIONAL' AND b.meta_departamento=$2)
         OR (e.nivel_gobierno='GOBIERNOS REGIONALES' AND b.meta_departamento IS NULL AND t.departamento=$2))
      ORDER BY e.nivel_gobierno,e.nombre LIMIT $3`,
    [anio, departamento, limit]
  );

  return {
    status: 200,
    body: {
      anio,
      departamento,
      limite: limit,
      resultados: rows.map((row) => ({ entityCode: row.entity_code, entidad: row.nombre, nivelGobierno: row.nivel_gobierno, reglaTerritorial: row.regla_territorial, clasificado: row.clasificado })),
      limitation: "El inventario identifica entidades presentes en la cobertura materializada. Que una entidad no esté clasificada no prueba que no pertenezca a un sector.",
    },
  };
}

/**
 * Handler para `radar_ejecucion_sector_comparativo` — GET /api/sectores/comparativo.
 */
export async function comparativo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const { anio, departamento: dep, ambito } = baseArgs(args);
  const sectorIds = ((args.sectores as string | undefined) ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  const all = await budgetByRegistry(db, anio, dep.toUpperCase(), ambito === "NACIONAL");
  const rows = sectorIds.length ? all.filter((row) => sectorIds.includes(row.sector_id)) : all;

  return {
    status: 200,
    body: {
      anio,
      departamento: ambito === "NACIONAL" ? "TODOS" : dep.toUpperCase(),
      resultados: rows.map(mapBudget),
      limitation: "El comparativo muestra responsabilidades distintas. No suma Gobierno Nacional dirigido al departamento y Gobierno Regional ejecutado por sede como un único presupuesto.",
    },
  };
}

/**
 * Handler para `radar_ejecucion_budget_movement` — GET /api/sectores/movimiento-presupuestal.
 */
export async function budgetMovement(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const { anio, departamento: dep, ambito } = baseArgs(args);
  const sectorIds = ((args.sectores as string | undefined) ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  const all = await budgetByRegistry(db, anio, dep.toUpperCase(), ambito === "NACIONAL");
  const rows = (sectorIds.length ? all.filter((row) => sectorIds.includes(row.sector_id)) : all).map(mapBudget);
  const movement = summarizeBudgetMovement(
    rows.map((row) => ({
      sectorId: row.sectorId, sector: row.sector, entidad: row.entidad, reglaTerritorial: row.reglaTerritorial,
      pia: row.pia, pim: row.pim, devengado: row.devengado, cortesUsados: row.cortesUsados,
    }))
  );
  const cortesUsados = [...new Set(rows.flatMap((row) => row.cortesUsados).map((fechaCorte) => `${fechaCorte}`))].sort();

  return {
    status: 200,
    body: {
      anio,
      departamento: ambito === "NACIONAL" ? "TODOS" : dep.toUpperCase(),
      sectoresSolicitados: sectorIds,
      cortesUsados,
      ...movement,
    },
  };
}

/**
 * Handler para `radar_ejecucion_sector_review_queue` — GET /api/sectores/revision.
 */
export async function reviewQueue(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const estado = (args.estado as string | undefined) ?? "PENDING";
  const limit = args.limit !== undefined ? Number(args.limit) : 100;

  const { rows } = await db.query<NeonRow>(
    `SELECT q.queue_id,q.candidate_type,q.entity_code,q.cui,q.contracting_id,q.reason,q.evidence_urls,q.status,q.created_at,
            COUNT(e.review_event_id)::integer AS eventos_revision
       FROM sector_link_review_queue q
  LEFT JOIN sector_link_review_events e ON e.queue_id=q.queue_id
      WHERE q.status=$1
      GROUP BY q.queue_id
      ORDER BY q.created_at DESC LIMIT $2`,
    [estado, limit]
  );

  return {
    status: 200,
    body: {
      estado,
      resultados: rows,
      limitation: "Los elementos de la cola son candidatos de revisión humana. No son vínculos oficiales ni alimentan agregados sectoriales.",
    },
  };
}

/**
 * Handler para `radar_ejecucion_sector_ficha` — GET /api/sectores/:sectorId/ficha.
 */
export async function ficha(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const { anio, departamento: dep, ambito } = baseArgs(args);
  const sectorId = (args.sectorId as string).toUpperCase();
  const ambitoNacional = ambito === "NACIONAL";

  const infobrasDb = crossAppPool("infobras", env);
  const comprasDb = crossAppPool("compras-publicas", env);

  const rows = await budgetByRegistry(db, anio, dep.toUpperCase(), ambitoNacional, sectorId);
  if (rows.length === 0) {
    return { status: 404, body: { error: "Sector no verificado o sin entidades registradas." } };
  }
  const budget = rows.map(mapBudget);
  const projects = await projectsForEntities(db, rows.map((row) => row.entity_code));
  const works = await worksForCuis(projects.map((project) => project.cui as string), infobrasDb);
  const procurement = await procurementForEntities(rows.map((row) => row.entity_code), comprasDb);

  return {
    status: 200,
    body: {
      sector: { id: sectorId, nombre: rows[0].sector_nombre },
      anio,
      departamento: ambitoNacional ? "TODOS" : dep.toUpperCase(),
      entidades: budget,
      inversiones: { estado: projects.length ? "VINCULO_OFICIAL" : "SIN_VINCULO_OFICIAL", resultados: projects },
      obras: works,
      contrataciones: procurement,
      advertenciaGasto: "No sumar entidades con reglaTerritorial META_DEPARTAMENTO y SEDE_EJECUTORA: miden gasto nacional dirigido vs ejecución con sede regional.",
      limitation: "CUI, obra y contratación aparecen solo mediante claves exactas verificadas. La ausencia de un puente no equivale a ausencia de inversión, obra o contratación.",
    },
  };
}

/**
 * Handler para `radar_ejecucion_sector_entidad_ficha` — GET /api/sectores/entidades/:entityCode/ficha.
 */
export async function entidadFicha(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const { anio, departamento: dep, ambito } = baseArgs(args);
  const entityCode = args.entityCode as string;

  const infobrasDb = crossAppPool("infobras", env);
  const comprasDb = crossAppPool("compras-publicas", env);

  const rows = await budgetByRegistry(db, anio, dep.toUpperCase(), ambito === "NACIONAL", undefined, entityCode);
  if (rows.length === 0) {
    return { status: 404, body: { error: "Entidad no verificada en el registro sectorial." } };
  }
  const projects = await projectsForEntities(db, [entityCode]);

  return {
    status: 200,
    body: {
      entidad: mapBudget(rows[0]),
      inversiones: { estado: projects.length ? "VINCULO_OFICIAL" : "SIN_VINCULO_OFICIAL", resultados: projects },
      obras: await worksForCuis(projects.map((project) => project.cui as string), infobrasDb),
      contrataciones: await procurementForEntities([entityCode], comprasDb),
      limitation: "La ficha no sustituye reglas territoriales ni atribuye gasto a CUI por nombre.",
    },
  };
}
