import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { comprasPool, infobrasPool } from "../db/external-pools.js";
import { LATEST_BUDGET_CTE } from "../db/budget-coverage.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { scopeLabel } from "../sector/registry.js";
import { summarizeBudgetMovement } from "../sector/movement.js";

export const sectorsRouter = Router();

const BaseQuery = z.object({
  anio: z.coerce.number().int().min(2009).max(2100).default(2026),
  departamento: z.string().min(1).default("LA LIBERTAD"),
});
const CompareQuery = BaseQuery.extend({ sectores: z.string().min(1).optional() });
const InventoryQuery = BaseQuery.extend({ limit: z.coerce.number().int().min(1).max(500).default(100) });
const ReviewQuery = z.object({ estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).default("PENDING"), limit: z.coerce.number().int().min(1).max(500).default(100) });

type BudgetRow = {
  sector_id: string; sector_nombre: string; entity_code: string; entity_name_publicado: string;
  entity_kind: string; nivel_gobierno: string; scope_rule: "META_DEPARTAMENTO" | "SEDE_EJECUTORA";
  pia: string | number; pim: string | number; devengado: string | number; cortes: unknown; resource_ids: unknown;
  estado_cobertura: string | null; cobertura_corte: string | Date | null; cobertura_registros: string | number | null;
};

function number(value: unknown): number { return Number(value ?? 0); }
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => item instanceof Date ? item.toISOString().slice(0, 10) : String(item)) : [];
}
function money(value: unknown): number { return Math.round(number(value) * 100) / 100; }

async function budgetByRegistry(anio: number, departamento: string, sectorId?: string, entityCode?: string): Promise<BudgetRow[]> {
  const params: unknown[] = [anio, departamento];
  const filters = ["r.verification_status = 'VERIFICADO'"];
  if (sectorId) { params.push(sectorId.toUpperCase()); filters.push(`r.sector_id = $${params.length}`); }
  if (entityCode) { params.push(entityCode); filters.push(`r.entity_code = $${params.length}`); }
  const { rows } = await pool.query<BudgetRow>(
    `${LATEST_BUDGET_CTE}
     SELECT r.sector_id,r.sector_nombre,r.entity_code,r.entity_name_publicado,r.entity_kind,r.nivel_gobierno,r.scope_rule,
            COALESCE(SUM(b.pia),0) AS pia,COALESCE(SUM(b.pim),0) AS pim,COALESCE(SUM(b.devengado),0) AS devengado,
            COALESCE(array_agg(DISTINCT b.fecha_corte) FILTER (WHERE b.fecha_corte IS NOT NULL), ARRAY[]::date[]) AS cortes,
            COALESCE(array_agg(DISTINCT rb.resource_id) FILTER (WHERE rb.resource_id IS NOT NULL), ARRAY[]::text[]) AS resource_ids,
            s.estado_cobertura, s.fecha_corte AS cobertura_corte, s.record_count AS cobertura_registros
       FROM sector_entity_registry r
  LEFT JOIN latest_budget b ON b.entity_code=r.entity_code AND b.anio_fiscal=$1
        AND ((r.scope_rule='META_DEPARTAMENTO' AND b.meta_departamento=$2)
          OR (r.scope_rule='SEDE_EJECUTORA' AND b.meta_departamento IS NULL))
  LEFT JOIN raw_mef_batches rb ON rb.id=b.source_batch_id
  LEFT JOIN budget_coverage_snapshots s ON s.activo=true AND s.anio_fiscal=$1 AND s.departamento=$2
        AND s.nivel_gobierno=r.nivel_gobierno
        AND s.origen_cobertura=CASE WHEN r.scope_rule='META_DEPARTAMENTO' THEN 'META_DEPARTAMENTO' ELSE 'SEDE_EJECUTORA' END
      WHERE ${filters.join(" AND ")}
      GROUP BY r.sector_id,r.sector_nombre,r.entity_code,r.entity_name_publicado,r.entity_kind,r.nivel_gobierno,r.scope_rule,
               s.estado_cobertura,s.fecha_corte,s.record_count
      ORDER BY r.sector_id,r.entity_name_publicado`,
    params,
  );
  return rows;
}

async function projectsForEntities(entityCodes: string[]) {
  if (entityCodes.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT p.cui,p.actividad_literal,p.entidad_responsable,p.departamento,p.pia_legal,p.pim,p.devengado,p.estado_pim,
            p.alerta_consistencia_territorial,p.observed_at,l.entity_code,l.evidence_url
       FROM project_evidence_links p
       JOIN project_budget_links l ON l.cui=p.cui
      WHERE l.link_status='VINCULO_OFICIAL' AND l.entity_code=ANY($1)
      ORDER BY p.cui`, [entityCodes],
  );
  return rows.map((row) => ({
    cui: row.cui, actividad: row.actividad_literal, entidadResponsable: row.entidad_responsable,
    departamento: row.departamento, piaLegal: row.pia_legal === null ? null : number(row.pia_legal),
    pim: row.pim === null ? null : number(row.pim), devengado: row.devengado === null ? null : number(row.devengado),
    estadoPim: row.estado_pim, entityCode: row.entity_code, evidenceUrl: row.evidence_url,
    alertaConsistenciaTerritorial: row.alerta_consistencia_territorial, fechaObservacion: row.observed_at,
  }));
}

async function worksForCuis(cuis: string[]) {
  if (cuis.length === 0) return { estado: "SIN_CUI_CON_VINCULO_OFICIAL", resultados: [] as unknown[] };
  if (!infobrasPool) return { estado: "INFOBRAS_NO_CONFIGURADO", resultados: [] as unknown[] };
  const { rows } = await infobrasPool.query(
    `SELECT codigo_infobras,cui,nombre_obra,estado_ejecucion,departamento,provincia,distrito,
            avance_fisico_real_pct,ejecucion_financiera_pct,existe_paralizacion
       FROM public_works WHERE cui=ANY($1) ORDER BY codigo_infobras`, [cuis],
  );
  return { estado: "CUI_EXACTO", resultados: rows.map((row) => ({
    codigoInfobras: row.codigo_infobras, cui: row.cui, nombre: row.nombre_obra, estadoEjecucion: row.estado_ejecucion,
    departamento: row.departamento, provincia: row.provincia, distrito: row.distrito,
    avanceFisicoRealPct: row.avance_fisico_real_pct === null ? null : number(row.avance_fisico_real_pct),
    ejecucionFinancieraPct: row.ejecucion_financiera_pct === null ? null : number(row.ejecucion_financiera_pct),
    existeParalizacion: row.existe_paralizacion,
  })) };
}

async function procurementForEntities(entityCodes: string[]) {
  if (entityCodes.length === 0) return { estado: "SIN_ENTIDADES_VERIFICADAS", resultados: [] as unknown[] };
  if (!comprasPool) return { estado: "COMPRAS_NO_CONFIGURADO", resultados: [] as unknown[] };
  const { rows: identities } = await comprasPool.query<{ subject_id: string }>(
    `SELECT DISTINCT subject_id FROM entity_identity_links
      WHERE strength IN ('EXACTA','VERIFICADA')
        AND ((source_identifier_type='MEF_ENTITY_CODE' AND source_identifier_value=ANY($1))
          OR (target_identifier_type='MEF_ENTITY_CODE' AND target_identifier_value=ANY($1)))`, [entityCodes],
  );
  const municipalityIds = identities.map((row) => row.subject_id);
  if (municipalityIds.length === 0) return { estado: "SIN_VINCULO_MEF_COMPRAS_VERIFICADO", resultados: [] as unknown[] };
  const { rows } = await comprasPool.query(
    `SELECT c.contracting_id,c.ocid,c.award_id,c.object_original,c.awarded_amount,c.publication_date,c.award_date,
            m.official_name,m.province,m.district,c.source_url
       FROM minor_contracts c JOIN municipalities m ON m.municipality_id=c.municipality_id
      WHERE c.municipality_id=ANY($1) ORDER BY c.publication_date DESC NULLS LAST LIMIT 200`, [municipalityIds],
  );
  return { estado: "IDENTIDAD_MEF_COMPRAS_VERIFICADA", resultados: rows.map((row) => ({
    contractingId: row.contracting_id, ocid: row.ocid, awardId: row.award_id, objeto: row.object_original,
    montoAdjudicado: row.awarded_amount === null ? null : number(row.awarded_amount), publicationDate: row.publication_date,
    awardDate: row.award_date, entidadCompradora: row.official_name, provincia: row.province, distrito: row.district, fuenteUrl: row.source_url,
  })) };
}

function mapBudget(row: BudgetRow) {
  const pim = number(row.pim); const devengado = number(row.devengado);
  return {
    sectorId: row.sector_id, sector: row.sector_nombre, entityCode: row.entity_code, entidad: row.entity_name_publicado,
    tipoEntidad: row.entity_kind, nivelGobierno: row.nivel_gobierno, reglaTerritorial: row.scope_rule,
    alcance: scopeLabel(row.scope_rule), pia: money(row.pia), pim: money(pim), devengado: money(devengado),
    saldoPorDevengar: pim >= devengado ? money(pim - devengado) : null,
    cobertura: { estado: row.estado_cobertura ?? "NO_VERIFICADA", fechaCorteParticion: row.cobertura_corte, registrosParticion: row.cobertura_registros === null ? null : number(row.cobertura_registros) },
    cortesUsados: stringArray(row.cortes), recursos: stringArray(row.resource_ids),
  };
}

sectorsRouter.get("/inventory", asyncHandler(async (req, res) => {
  const query = parseQuery(InventoryQuery, req.query, res); if (!query) return;
  const departamento = query.departamento.toUpperCase();
  const { rows } = await pool.query(
    `${LATEST_BUDGET_CTE}
     SELECT DISTINCT e.entity_code,e.nombre,e.nivel_gobierno,
            CASE WHEN e.nivel_gobierno='GOBIERNO NACIONAL' THEN 'META_DEPARTAMENTO' ELSE 'SEDE_EJECUTORA' END AS regla_territorial,
            EXISTS(SELECT 1 FROM sector_entity_registry r WHERE r.entity_code=e.entity_code AND r.verification_status='VERIFICADO') AS clasificado
       FROM latest_budget b JOIN entities e ON e.entity_code=b.entity_code
       LEFT JOIN territories t ON t.ubigeo=e.ubigeo
      WHERE b.anio_fiscal=$1 AND ((e.nivel_gobierno='GOBIERNO NACIONAL' AND b.meta_departamento=$2)
         OR (e.nivel_gobierno='GOBIERNOS REGIONALES' AND b.meta_departamento IS NULL AND t.departamento=$2))
      ORDER BY e.nivel_gobierno,e.nombre LIMIT $3`, [query.anio, departamento, query.limit],
  );
  res.json({ anio: query.anio, departamento, limite: query.limit, resultados: rows.map((row) => ({ entityCode: row.entity_code, entidad: row.nombre, nivelGobierno: row.nivel_gobierno, reglaTerritorial: row.regla_territorial, clasificado: row.clasificado })), limitation: "El inventario identifica entidades presentes en la cobertura materializada. Que una entidad no esté clasificada no prueba que no pertenezca a un sector." });
}));

sectorsRouter.get("/comparativo", asyncHandler(async (req, res) => {
  const query = parseQuery(CompareQuery, req.query, res); if (!query) return;
  const sectorIds = query.sectores?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [];
  const all = await budgetByRegistry(query.anio, query.departamento.toUpperCase());
  const rows = sectorIds.length ? all.filter((row) => sectorIds.includes(row.sector_id)) : all;
  res.json({ anio: query.anio, departamento: query.departamento.toUpperCase(), resultados: rows.map(mapBudget), limitation: "El comparativo muestra responsabilidades distintas. No suma Gobierno Nacional dirigido al departamento y Gobierno Regional ejecutado por sede como un único presupuesto." });
}));

sectorsRouter.get("/movimiento-presupuestal", asyncHandler(async (req, res) => {
  const query = parseQuery(CompareQuery, req.query, res); if (!query) return;
  const sectorIds = query.sectores?.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [];
  const all = await budgetByRegistry(query.anio, query.departamento.toUpperCase());
  const rows = (sectorIds.length ? all.filter((row) => sectorIds.includes(row.sector_id)) : all).map(mapBudget);
  const movement = summarizeBudgetMovement(rows.map((row) => ({
    sectorId: row.sectorId, sector: row.sector, entidad: row.entidad, reglaTerritorial: row.reglaTerritorial,
    pia: row.pia, pim: row.pim, devengado: row.devengado, cortesUsados: row.cortesUsados,
  })));
  const cortesUsados = [...new Set(rows.flatMap((row) => row.cortesUsados).map((fechaCorte) => `${fechaCorte}`))].sort();
  res.json({ anio: query.anio, departamento: query.departamento.toUpperCase(), sectoresSolicitados: sectorIds, cortesUsados, ...movement });
}));

sectorsRouter.get("/revision", asyncHandler(async (req, res) => {
  const query = parseQuery(ReviewQuery, req.query, res); if (!query) return;
  const { rows } = await pool.query(
    `SELECT q.queue_id,q.candidate_type,q.entity_code,q.cui,q.contracting_id,q.reason,q.evidence_urls,q.status,q.created_at,
            COUNT(e.review_event_id)::integer AS eventos_revision
       FROM sector_link_review_queue q
  LEFT JOIN sector_link_review_events e ON e.queue_id=q.queue_id
      WHERE q.status=$1
      GROUP BY q.queue_id
      ORDER BY q.created_at DESC LIMIT $2`, [query.estado, query.limit],
  );
  res.json({ estado: query.estado, resultados: rows, limitation: "Los elementos de la cola son candidatos de revisión humana. No son vínculos oficiales ni alimentan agregados sectoriales." });
}));

sectorsRouter.get("/:sectorId/ficha", asyncHandler(async (req, res) => {
  const query = parseQuery(BaseQuery, req.query, res); if (!query) return;
  const sectorId = req.params.sectorId.toUpperCase();
  const rows = await budgetByRegistry(query.anio, query.departamento.toUpperCase(), sectorId);
  if (rows.length === 0) { res.status(404).json({ error: "Sector no verificado o sin entidades registradas." }); return; }
  const budget = rows.map(mapBudget); const projects = await projectsForEntities(rows.map((row) => row.entity_code));
  const works = await worksForCuis(projects.map((project) => project.cui));
  const procurement = await procurementForEntities(rows.map((row) => row.entity_code));
  res.json({ sector: { id: sectorId, nombre: rows[0].sector_nombre }, anio: query.anio, departamento: query.departamento.toUpperCase(), entidades: budget, inversiones: { estado: projects.length ? "VINCULO_OFICIAL" : "SIN_VINCULO_OFICIAL", resultados: projects }, obras: works, contrataciones: procurement, advertenciaGasto: "No sumar entidades con reglaTerritorial META_DEPARTAMENTO y SEDE_EJECUTORA: miden gasto nacional dirigido vs ejecución con sede regional.", limitation: "CUI, obra y contratación aparecen solo mediante claves exactas verificadas. La ausencia de un puente no equivale a ausencia de inversión, obra o contratación." });
}));

sectorsRouter.get("/entidades/:entityCode/ficha", asyncHandler(async (req, res) => {
  const query = parseQuery(BaseQuery, req.query, res); if (!query) return;
  const rows = await budgetByRegistry(query.anio, query.departamento.toUpperCase(), undefined, req.params.entityCode);
  if (rows.length === 0) { res.status(404).json({ error: "Entidad no verificada en el registro sectorial." }); return; }
  const projects = await projectsForEntities([req.params.entityCode]);
  res.json({ entidad: mapBudget(rows[0]), inversiones: { estado: projects.length ? "VINCULO_OFICIAL" : "SIN_VINCULO_OFICIAL", resultados: projects }, obras: await worksForCuis(projects.map((project) => project.cui)), contrataciones: await procurementForEntities([req.params.entityCode]), limitation: "La ficha no sustituye reglas territoriales ni atribuye gasto a CUI por nombre." });
}));
