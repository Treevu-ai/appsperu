import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { infobrasPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const infrastructureRouter = Router();

const families = ["DRENAJE", "EDUCACION", "AGUA_SANEAMIENTO", "TRANSPORTE", "RIEGO", "OTRA"] as const;
const BaseQuery = z.object({
  departamento: z.string().min(1).max(120).default("LA LIBERTAD"),
  sector: z.enum(families).optional(),
});
const YearQuery = z.object({ anio: z.coerce.number().int().min(2000).max(2100).optional() });
const QueueQuery = z.object({ estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).default("PENDING") });
const IntegrityQuery = BaseQuery.extend({ estricto: z.enum(["true", "false"]).optional().default("false") });

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function source(row: Record<string, unknown>) {
  return { etiqueta: row.source_label, url: row.source_url, fechaExtraccion: row.extracted_at, automatizacion: row.automation_status, checksum: row.checksum_status };
}

async function worksByExactCui(cuis: string[]) {
  if (cuis.length === 0) return new Map<string, { estado: string; resultados: unknown[] }>();
  if (!infobrasPool) return new Map(cuis.map((cui) => [cui, { estado: "INFOBRAS_NO_CONFIGURADO", resultados: [] }]));
  const { rows } = await infobrasPool.query(
    `SELECT codigo_infobras,cui,nombre_obra,estado_ejecucion,departamento,provincia,distrito,
            avance_fisico_real_pct,ejecucion_financiera_pct,existe_paralizacion
       FROM public_works WHERE cui=ANY($1) ORDER BY codigo_infobras`, [cuis],
  );
  const result = new Map(cuis.map((cui) => [cui, { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] as unknown[] }]));
  for (const row of rows) {
    const current = result.get(row.cui) ?? { estado: "CUI_EXACTO", resultados: [] as unknown[] };
    current.estado = "CUI_EXACTO";
    current.resultados.push({
      codigoInfobras: row.codigo_infobras, cui: row.cui, nombre: row.nombre_obra, estadoEjecucion: row.estado_ejecucion,
      departamento: row.departamento, provincia: row.provincia, distrito: row.distrito,
      avanceFisicoRealPct: numberOrNull(row.avance_fisico_real_pct), ejecucionFinancieraPct: numberOrNull(row.ejecucion_financiera_pct), existeParalizacion: row.existe_paralizacion,
    });
    result.set(row.cui, current);
  }
  return result;
}

async function obraProgressForAsset(assetId: string) {
  const { rows } = await pool.query(
    `SELECT etapa, avance_pct, literal_fuente, source_url, observed_at
     FROM asset_obra_progress WHERE asset_id = $1 ORDER BY observed_at DESC`,
    [assetId]
  );
  return rows.map((row) => ({
    etapa: row.etapa,
    avancePct: row.avance_pct === null ? null : Number(row.avance_pct),
    literalFuente: row.literal_fuente,
    fuenteUrl: row.source_url,
    fechaObservada: row.observed_at,
  }));
}

function cadenaObra(
  obraInfoBras: { estado: string; resultados: unknown[] },
  obraProgress: Awaited<ReturnType<typeof obraProgressForAsset>>,
  stagesState: ReturnType<typeof stages>
) {
  return {
    obra: obraInfoBras,
    etapaProyecto: obraProgress,
    recepcion: stagesState.cierre,
    operador: stagesState.operador,
    mantenimiento: stagesState.mantenimiento,
    disponibilidad: stagesState.disponibilidad,
    cautela:
      "Etapa de proyecto (diseño/ejecución) no equivale a recepción formal ni a operador del servicio.",
  };
}

function stages(row: Record<string, unknown>) {
  const handovers = Number(row.handover_count ?? 0);
  const operators = Number(row.operator_count ?? 0);
  const maintenance = Number(row.maintenance_count ?? 0);
  return {
    cierre: handovers > 0 ? "CIERRE_O_RECEPCION_DOCUMENTADO" : "SIN_EVIDENCIA_DE_CIERRE",
    operador: operators > 0 ? "OPERADOR_DOCUMENTADO" : "SIN_EVIDENCIA_DE_OPERADOR",
    mantenimiento: maintenance > 0 ? "EVIDENCIA_DE_MANTENIMIENTO_INGRESADA" : "SIN_EVIDENCIA_DE_MANTENIMIENTO",
    disponibilidad: row.availability_status ?? "SIN_EVIDENCIA_DE_OPERACION",
    servicio: Number(row.indicator_count ?? 0) > 0 ? "INDICADOR_DE_SERVICIO_INGRESADO" : "SIN_INDICADOR_DE_SERVICIO_INGRESADO",
  };
}

async function assetRow(assetId: string) {
  return pool.query(
    `SELECT a.asset_id,a.asset_family,a.asset_name_published,a.department,a.province,a.district,a.cui,a.infobras_code,a.sector_asset_code,
            a.identity_status,a.observed_at,a.limitation,b.source_url,b.source_label,b.extracted_at,b.automation_status,b.checksum_status,
            (SELECT COUNT(*)::int FROM asset_handover_evidence h WHERE h.asset_id=a.asset_id) AS handover_count,
            (SELECT COUNT(*)::int FROM asset_operator_assignments o WHERE o.asset_id=a.asset_id) AS operator_count,
            (SELECT COUNT(*)::int FROM asset_maintenance_evidence m WHERE m.asset_id=a.asset_id) AS maintenance_count,
            (SELECT COUNT(*)::int FROM asset_service_indicators i WHERE i.asset_id=a.asset_id) AS indicator_count,
            (SELECT av.availability_status FROM asset_availability_observations av WHERE av.asset_id=a.asset_id ORDER BY av.observed_on DESC,av.availability_id DESC LIMIT 1) AS availability_status
       FROM infrastructure_assets a JOIN infrastructure_evidence_batches b ON b.batch_id=a.source_batch_id
      WHERE a.asset_id=$1`, [assetId],
  );
}

infrastructureRouter.get("/activos", asyncHandler(async (req, res) => {
  const query = parseQuery(BaseQuery, req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT a.asset_id,a.asset_family,a.asset_name_published,a.department,a.province,a.district,a.cui,a.infobras_code,a.sector_asset_code,
            a.identity_status,a.observed_at,a.limitation,b.source_url,b.source_label,b.extracted_at,b.automation_status,b.checksum_status,
            (SELECT COUNT(*)::int FROM asset_handover_evidence h WHERE h.asset_id=a.asset_id) AS handover_count,
            (SELECT COUNT(*)::int FROM asset_operator_assignments o WHERE o.asset_id=a.asset_id) AS operator_count,
            (SELECT COUNT(*)::int FROM asset_maintenance_evidence m WHERE m.asset_id=a.asset_id) AS maintenance_count,
            (SELECT COUNT(*)::int FROM asset_service_indicators i WHERE i.asset_id=a.asset_id) AS indicator_count,
            (SELECT av.availability_status FROM asset_availability_observations av WHERE av.asset_id=a.asset_id ORDER BY av.observed_on DESC,av.availability_id DESC LIMIT 1) AS availability_status
       FROM infrastructure_assets a JOIN infrastructure_evidence_batches b ON b.batch_id=a.source_batch_id
      WHERE upper(a.department)=upper($1) AND ($2::text IS NULL OR a.asset_family=$2)
      ORDER BY a.asset_family,a.asset_name_published`, [query.departamento, query.sector ?? null],
  );
  const works = await worksByExactCui(result.rows.map((row) => row.cui).filter((cui): cui is string => Boolean(cui)));
  res.json({
    departamento: query.departamento.toUpperCase(), sector: query.sector ?? null,
    resultados: result.rows.map((row) => ({
      id: row.asset_id, familia: row.asset_family, activo: row.asset_name_published,
      territorio: { departamento: row.department, provincia: row.province, distrito: row.district },
      identidad: { cui: row.cui, codigoInfobras: row.infobras_code, codigoSectorial: row.sector_asset_code, estado: row.identity_status },
      etapas: stages(row), obraInfoBras: row.cui ? works.get(row.cui) ?? { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] } : { estado: "SIN_CUI_PUBLICADO", resultados: [] },
      fuente: source(row), fechaObservada: row.observed_at, limitacion: row.limitation,
    })),
    cautela: "Avance físico, presupuesto o una nota de inauguración no prueban recepción, operación, mantenimiento ni beneficio efectivo.",
  });
}));

infrastructureRouter.get("/activos/:assetId", asyncHandler(async (req, res) => {
  const result = await assetRow(req.params.assetId);
  const asset = result.rows[0];
  if (!asset) { res.status(404).json({ error: "Activo no materializado en ALSOL." }); return; }
  const [handovers, operators, maintenance, availability, indicators, reviews] = await Promise.all([
    pool.query("SELECT handover_type,issuer_name,handover_date,source_url,source_detail,observed_at FROM asset_handover_evidence WHERE asset_id=$1 ORDER BY handover_date DESC", [asset.asset_id]),
    pool.query("SELECT operator_name,operator_role,valid_from,valid_to,source_url,source_detail,observed_at FROM asset_operator_assignments WHERE asset_id=$1 ORDER BY observed_at DESC", [asset.asset_id]),
    pool.query("SELECT maintenance_scope,evidence_status,activity_reference,contract_reference,fiscal_year,pim,devengado,source_url,source_detail,observed_at FROM asset_maintenance_evidence WHERE asset_id=$1 ORDER BY observed_at DESC", [asset.asset_id]),
    pool.query("SELECT availability_status,scope_literal,observed_on,source_url,source_detail,recorded_at FROM asset_availability_observations WHERE asset_id=$1 ORDER BY observed_on DESC", [asset.asset_id]),
    pool.query("SELECT indicator_scope,indicator_name,indicator_unit,period_label,value_numeric,value_text,denominator,coverage_literal,source_url,source_detail,observed_at FROM asset_service_indicators WHERE asset_id=$1 ORDER BY observed_at DESC", [asset.asset_id]),
    pool.query("SELECT queue_id,candidate_kind,reason,evidence_urls,status,created_at FROM asset_evidence_review_queue WHERE asset_id=$1 ORDER BY queue_id", [asset.asset_id]),
  ]);
  const works = asset.cui ? await worksByExactCui([asset.cui]) : new Map<string, { estado: string; resultados: unknown[] }>();
  const obraInfoBras = asset.cui ? works.get(asset.cui) ?? { estado: "SIN_OBRA_INFOBRAS_PARA_CUI", resultados: [] } : { estado: "SIN_CUI_PUBLICADO", resultados: [] };
  const obraProgress = await obraProgressForAsset(asset.asset_id);
  const etapas = stages(asset);
  res.json({
    id: asset.asset_id, familia: asset.asset_family, activo: asset.asset_name_published,
    territorio: { departamento: asset.department, provincia: asset.province, distrito: asset.district },
    identidad: { cui: asset.cui, codigoInfobras: asset.infobras_code, codigoSectorial: asset.sector_asset_code, estado: asset.identity_status },
    etapas,
    cadenaObra: cadenaObra(obraInfoBras, obraProgress, etapas),
    obraInfoBras,
    cierre: handovers.rows, operadores: operators.rows, mantenimiento: maintenance.rows, disponibilidad: availability.rows, indicadoresServicio: indicators.rows,
    evidenciaPendiente: reviews.rows.map((row) => ({ id: numberOrNull(row.queue_id), tipo: row.candidate_kind, motivo: row.reason, urls: row.evidence_urls, estado: row.status, creadoEn: row.created_at })),
    fuente: source(asset), fechaObservada: asset.observed_at, limitacion: asset.limitation,
    cautela: "La ausencia de una acta, operador o indicador en ALSOL es un vacío de evidencia materializada; no demuestra que el activo esté inoperativo.",
  });
}));

infrastructureRouter.get("/activos/:assetId/operacion", asyncHandler(async (req, res) => {
  const result = await assetRow(req.params.assetId);
  const asset = result.rows[0];
  if (!asset) { res.status(404).json({ error: "Activo no materializado en ALSOL." }); return; }
  const [handovers, operators, availability] = await Promise.all([
    pool.query("SELECT handover_type,issuer_name,handover_date,source_url,source_detail FROM asset_handover_evidence WHERE asset_id=$1 ORDER BY handover_date DESC", [asset.asset_id]),
    pool.query("SELECT operator_name,operator_role,valid_from,valid_to,source_url,source_detail FROM asset_operator_assignments WHERE asset_id=$1 ORDER BY observed_at DESC", [asset.asset_id]),
    pool.query("SELECT availability_status,scope_literal,observed_on,source_url,source_detail FROM asset_availability_observations WHERE asset_id=$1 ORDER BY observed_on DESC", [asset.asset_id]),
  ]);
  res.json({ id: asset.asset_id, activo: asset.asset_name_published, etapas: stages(asset), cierre: handovers.rows, operadores: operators.rows, disponibilidad: availability.rows, fuente: source(asset), limitacion: "Recepción, asignación de operador y disponibilidad se conservan como hechos distintos; ninguno sustituye al otro." });
}));

infrastructureRouter.get("/activos/:assetId/mantenimiento", asyncHandler(async (req, res) => {
  const query = parseQuery(YearQuery, req.query, res);
  if (!query) return;
  const result = await assetRow(req.params.assetId);
  const asset = result.rows[0];
  if (!asset) { res.status(404).json({ error: "Activo no materializado en ALSOL." }); return; }
  const maintenance = await pool.query(
    `SELECT maintenance_scope,evidence_status,activity_reference,contract_reference,fiscal_year,pim,devengado,source_url,source_detail,observed_at
       FROM asset_maintenance_evidence WHERE asset_id=$1 AND ($2::int IS NULL OR fiscal_year=$2) ORDER BY fiscal_year DESC,observed_at DESC`, [asset.asset_id, query.anio ?? null],
  );
  res.json({ id: asset.asset_id, activo: asset.asset_name_published, etapa: stages(asset).mantenimiento, anio: query.anio ?? null, resultados: maintenance.rows.map((row) => ({ ...row, pim: numberOrNull(row.pim), devengado: numberOrNull(row.devengado) })), fuente: source(asset), limitacion: "PIM/devengado identifican financiamiento o ejecución presupuestal publicada; no prueban por sí mismos que el mantenimiento se realizó o resolvió una restricción." });
}));

infrastructureRouter.get("/integridad", asyncHandler(async (req, res) => {
  const query = parseQuery(IntegrityQuery, req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT COUNT(DISTINCT a.asset_id)::int AS activos,
            COUNT(DISTINCT a.asset_id) FILTER (WHERE EXISTS (SELECT 1 FROM asset_handover_evidence h WHERE h.asset_id=a.asset_id))::int AS con_cierre,
            COUNT(DISTINCT a.asset_id) FILTER (WHERE EXISTS (SELECT 1 FROM asset_operator_assignments o WHERE o.asset_id=a.asset_id))::int AS con_operador,
            COUNT(DISTINCT a.asset_id) FILTER (WHERE EXISTS (SELECT 1 FROM asset_maintenance_evidence m WHERE m.asset_id=a.asset_id))::int AS con_mantenimiento,
            COUNT(DISTINCT a.asset_id) FILTER (WHERE EXISTS (SELECT 1 FROM asset_availability_observations av WHERE av.asset_id=a.asset_id))::int AS con_disponibilidad,
            COUNT(DISTINCT a.asset_id) FILTER (WHERE EXISTS (SELECT 1 FROM asset_service_indicators i WHERE i.asset_id=a.asset_id))::int AS con_indicador,
            COUNT(DISTINCT a.asset_family)::int AS familias_materializadas,
            COUNT(DISTINCT q.queue_id) FILTER (WHERE q.status='PENDING')::int AS pendientes_revision
       FROM infrastructure_assets a
       LEFT JOIN asset_evidence_review_queue q ON q.asset_id=a.asset_id
      WHERE upper(a.department)=upper($1) AND ($2::text IS NULL OR a.asset_family=$2)`, [query.departamento, query.sector ?? null],
  );
  const current = result.rows[0];
  const blocked = Number(current.activos) === 0 || Number(current.con_cierre) < Number(current.activos) || Number(current.con_operador) < Number(current.activos) || Number(current.con_disponibilidad) < Number(current.activos);
  const response = {
    departamento: query.departamento.toUpperCase(), sector: query.sector ?? null,
    estado: blocked ? "BLOQUEADO_POR_EVIDENCIA" : "CADENA_MINIMA_DOCUMENTADA",
    controles: { activos: Number(current.activos), conCierre: Number(current.con_cierre), conOperador: Number(current.con_operador), conMantenimiento: Number(current.con_mantenimiento), conDisponibilidad: Number(current.con_disponibilidad), conIndicadorServicio: Number(current.con_indicador), familiasMaterializadas: Number(current.familias_materializadas), pendientesRevision: Number(current.pendientes_revision) },
    bloqueo: blocked ? "No todos los activos materializados tienen recepción/cierre, operador y disponibilidad documentados. ALSOL no puede presentarlos como infraestructura que funciona." : null,
    cautela: "Una cadena documental mínima no certifica calidad, seguridad, impacto económico ni desempeño permanente.",
  };
  if (blocked && query.estricto === "true") { res.status(409).json(response); return; }
  res.json(response);
}));

infrastructureRouter.get("/evidencia-pendiente", asyncHandler(async (req, res) => {
  const query = parseQuery(QueueQuery, req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT q.queue_id,q.candidate_kind,q.reason,q.evidence_urls,q.status,q.created_at,a.asset_id,a.asset_family,a.asset_name_published
       FROM asset_evidence_review_queue q JOIN infrastructure_assets a ON a.asset_id=q.asset_id
      WHERE q.status=$1 ORDER BY q.created_at,q.queue_id`, [query.estado],
  );
  res.json({ estado: query.estado, resultados: result.rows.map((row) => ({ id: numberOrNull(row.queue_id), activo: { id: row.asset_id, familia: row.asset_family, nombre: row.asset_name_published }, tipo: row.candidate_kind, motivo: row.reason, urls: row.evidence_urls, creadoEn: row.created_at })), regla: "La cola organiza búsqueda y revisión humana; no prueba falta de operación, mantenimiento o servicio en el mundo real." });
}));
