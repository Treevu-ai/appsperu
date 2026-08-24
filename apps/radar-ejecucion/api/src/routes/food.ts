import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { identidadFiscalPool, sancionesPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const foodRouter = Router();

const PeriodQuery = z.object({
  periodo: z.coerce.number().int().min(2000).max(2100).default(2025),
});

const LotsQuery = PeriodQuery.extend({
  estado: z.enum(["CONTRATO_PUBLICADO", "ENTREGA_REFERIDA_EN_DOCUMENTO", "OBSERVACION_CONTRACTUAL_DOCUMENTADA"]).optional(),
});

const CoverageQuery = PeriodQuery.extend({
  provincia: z.string().min(1).max(120).optional(),
  distrito: z.string().min(1).max(120).optional(),
});

const QueueQuery = PeriodQuery.extend({
  estado: z.enum(["PENDING", "REVIEWED", "DISMISSED", "NEEDS_EVIDENCE"]).optional(),
});

const ObservationQuery = z.object({
  tipo: z.enum(["SANCION_FORMAL", "DENUNCIA_CON_EXPEDIENTE", "PROCESO_EN_CURSO", "ANTIGUEDAD_RUC", "REFERENCIA_EXTERNA"]).optional(),
  estado: z.enum(["VIGENTE", "PRESENTADA", "EN_INVESTIGACION", "ARCHIVADA", "RESUELTA", "CONTEXTO"]).optional(),
});

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function daysBetween(start: string | Date | null, end: string | Date | null): number | null {
  if (!start || !end) return null;
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

function periodNotFound(res: import("express").Response, year: number): void {
  res.status(404).json({
    error: "No hay un periodo de alimentación escolar materializado para el año solicitado.",
    anio: year,
  });
}

async function supplierCompliance(ruc: string) {
  const fiscal = identidadFiscalPool
    ? await identidadFiscalPool.query(
      "SELECT ruc,razon_social,estado_contribuyente,condicion_domicilio,ubigeo FROM contribuyentes WHERE ruc=$1", [ruc],
    ).then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultado: rows[0] ?? null }))
    : { estado: "IDENTIDAD_FISCAL_NO_CONFIGURADA", resultado: null };

  const sanciones = sancionesPool
    ? await sancionesPool.query(
      "SELECT ruc,entidad_sancionadora,tipo_sancion,estado_sancion,fecha_inicio,fecha_fin FROM sanciones WHERE ruc=$1 ORDER BY fecha_inicio DESC", [ruc],
    ).then(({ rows }) => ({ estado: "CONSULTADO_POR_RUC_EXACTO", resultados: rows }))
    : { estado: "SANCIONES_NO_CONFIGURADAS", resultados: [] };

  return { fiscal, sanciones };
}

foodRouter.get("/lotes", asyncHandler(async (req, res) => {
  const query = parseQuery(LotsQuery, req.query, res);
  if (!query) return;

  const periodResult = await pool.query(
    `SELECT p.period_id,p.year,p.territorial_unit,p.modality,p.planned_students,p.planned_schools,p.published_lots,p.awarded_lots,
            p.materialized_lots,p.school_denominator_status,p.coverage_status,p.limitation,
            b.source_url,b.source_label,b.automation_status,b.checksum_status,b.extracted_at
       FROM food_service_periods p
       JOIN food_evidence_batches b ON b.batch_id=p.source_batch_id
      WHERE p.year=$1
      ORDER BY p.period_id`,
    [query.periodo],
  );
  const period = periodResult.rows[0];
  if (!period) { periodNotFound(res, query.periodo); return; }

  const lotsResult = await pool.query(
    `SELECT l.lot_id,l.committee_name,l.item_literal,l.contract_reference,l.modality,l.supplier_name_published,l.supplier_ruc,
            l.supplier_ruc_status,l.documented_delivery_number,l.lot_status,l.observed_at,l.limitation,
            b.source_url,b.source_label,b.automation_status,b.extracted_at,
            COALESCE(json_agg(json_build_object('tipo',e.evidence_type,'url',e.evidence_url,'detalle',e.evidence_detail,'fechaObservada',e.observed_at)
              ORDER BY e.evidence_id) FILTER (WHERE e.evidence_id IS NOT NULL), '[]'::json) AS evidencias
       FROM food_lots l
       JOIN food_evidence_batches b ON b.batch_id=l.source_batch_id
       LEFT JOIN food_lot_evidence e ON e.lot_id=l.lot_id
      WHERE l.period_id=$1 AND ($2::text IS NULL OR l.lot_status=$2)
      GROUP BY l.lot_id,b.source_url,b.source_label,b.automation_status,b.extracted_at
      ORDER BY l.committee_name,l.item_literal`,
    [period.period_id, query.estado ?? null],
  );

  res.json({
    periodo: {
      id: period.period_id, anio: asNumber(period.year), territorio: period.territorial_unit, modalidad: period.modality,
      estudiantesPublicados: period.planned_students === null ? null : asNumber(period.planned_students),
      colegiosPublicados: period.planned_schools === null ? null : asNumber(period.planned_schools),
      lotesPublicados: period.published_lots === null ? null : asNumber(period.published_lots),
      lotesAdjudicadosPublicados: period.awarded_lots === null ? null : asNumber(period.awarded_lots),
      lotesMaterializados: asNumber(period.materialized_lots), estadoCobertura: period.coverage_status,
      estadoDenominadorColegios: period.school_denominator_status, limitacion: period.limitation,
      fuente: { etiqueta: period.source_label, url: period.source_url, fechaExtraccion: period.extracted_at, automatizacion: period.automation_status, checksum: period.checksum_status },
    },
    resultados: lotsResult.rows.map((lot) => ({
      id: lot.lot_id, comite: lot.committee_name, item: lot.item_literal, contrato: lot.contract_reference, modalidad: lot.modality,
      proveedorPublicado: lot.supplier_name_published, ruc: lot.supplier_ruc,
      estadoRuc: lot.supplier_ruc_status, entregaReferidaNumero: lot.documented_delivery_number === null ? null : asNumber(lot.documented_delivery_number),
      estadoLote: lot.lot_status, fechaObservada: lot.observed_at, limitacion: lot.limitation,
      fuente: { etiqueta: lot.source_label, url: lot.source_url, fechaExtraccion: lot.extracted_at, automatizacion: lot.automation_status }, evidencias: lot.evidencias,
    })),
    cautela: "Una referencia a entrega en un expediente no acredita por sí sola la recepción en un colegio. Un RUC nulo no se completa a partir del nombre del proveedor.",
  });
}));

foodRouter.get("/cobertura", asyncHandler(async (req, res) => {
  const query = parseQuery(CoverageQuery, req.query, res);
  if (!query) return;
  const periodResult = await pool.query(
    `SELECT p.period_id,p.year,p.territorial_unit,p.planned_students,p.planned_schools,p.school_denominator_status,p.coverage_status,p.limitation,
            b.source_url,b.source_label,b.extracted_at,b.automation_status
       FROM food_service_periods p JOIN food_evidence_batches b ON b.batch_id=p.source_batch_id
      WHERE p.year=$1 ORDER BY p.period_id`, [query.periodo],
  );
  const period = periodResult.rows[0];
  if (!period) { periodNotFound(res, query.periodo); return; }
  const coverage = await pool.query(
    `SELECT s.province,s.district,COUNT(DISTINCT s.school_id)::int AS colegios_documentados,
            COUNT(DISTINCT d.delivery_id)::int AS entregas_con_acta
       FROM food_schools s
       LEFT JOIN food_delivery_evidence d ON d.school_id=s.school_id
      WHERE s.period_id=$1 AND ($2::text IS NULL OR upper(s.province)=upper($2)) AND ($3::text IS NULL OR upper(s.district)=upper($3))
      GROUP BY s.province,s.district ORDER BY s.province,s.district`,
    [period.period_id, query.provincia ?? null, query.distrito ?? null],
  );
  const totals = await pool.query(
    `SELECT COUNT(DISTINCT s.school_id)::int AS colegios_documentados,COUNT(DISTINCT d.delivery_id)::int AS entregas_con_acta
       FROM food_schools s LEFT JOIN food_delivery_evidence d ON d.school_id=s.school_id WHERE s.period_id=$1`, [period.period_id],
  );
  const current = totals.rows[0];
  res.json({
    periodo: { id: period.period_id, anio: asNumber(period.year), territorio: period.territorial_unit, estudiantesPublicados: period.planned_students === null ? null : asNumber(period.planned_students), colegiosPublicados: period.planned_schools === null ? null : asNumber(period.planned_schools) },
    fuente: { etiqueta: period.source_label, url: period.source_url, fechaExtraccion: period.extracted_at, automatizacion: period.automation_status },
    estadoCobertura: period.coverage_status, estadoDenominadorColegios: period.school_denominator_status,
    colegiosDocumentados: asNumber(current.colegios_documentados), entregasConActaDocumentada: asNumber(current.entregas_con_acta),
    resultados: coverage.rows.map((row) => ({ provincia: row.province, distrito: row.district, colegiosDocumentados: asNumber(row.colegios_documentados), entregasConActaDocumentada: asNumber(row.entregas_con_acta) })),
    limitacion: `${period.limitation} No se atribuyen los colegios o las entregas agregadas a un distrito sin una clave oficial de la institución educativa.`,
  });
}));

foodRouter.get("/proveedores/:ruc", asyncHandler(async (req, res) => {
  const ruc = z.string().regex(/^\d{11}$/).safeParse(req.params.ruc);
  if (!ruc.success) { res.status(400).json({ error: "El RUC debe contener exactamente 11 dígitos." }); return; }
  const query = parseQuery(PeriodQuery, req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT l.lot_id,l.committee_name,l.item_literal,l.contract_reference,l.lot_status,l.supplier_ruc,
            b.source_url,b.source_label,b.extracted_at
       FROM food_lots l JOIN food_service_periods p ON p.period_id=l.period_id
       JOIN food_evidence_batches b ON b.batch_id=l.source_batch_id
      WHERE p.year=$1 AND l.supplier_ruc=$2 ORDER BY l.lot_id`, [query.periodo, ruc.data],
  );
  if (result.rows.length === 0) {
    res.status(404).json({
      error: "No hay lotes alimentarios vinculados a ese RUC exacto en el periodo materializado.",
      ruc: ruc.data,
      cautela: "ALSOL no vincula nombres de consorcio a un RUC sin una clave oficial exacta.",
    });
    return;
  }
  res.json({ ruc: ruc.data, lotes: result.rows.map((row) => ({ ...row, fuente: { etiqueta: row.source_label, url: row.source_url, fechaExtraccion: row.extracted_at }, source_label: undefined, source_url: undefined, extracted_at: undefined })), cumplimiento: await supplierCompliance(ruc.data) });
}));

foodRouter.get("/observaciones-proveedor/pendientes", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT observation_id,supplier_name_literal,observation_kind,observation_status,authority_name,case_reference,
            source_url,source_detail,observed_at,linkage_status
       FROM supplier_observations
      WHERE ruc IS NULL
      ORDER BY observed_at DESC,observation_id DESC`,
  );
  res.json({
    resultados: result.rows.map((row) => ({
      id: asNumber(row.observation_id), proveedorLiteral: row.supplier_name_literal, tipo: row.observation_kind,
      estado: row.observation_status, autoridad: row.authority_name, expediente: row.case_reference,
      fuente: { url: row.source_url, detalle: row.source_detail, fechaObservada: row.observed_at }, estadoVinculo: row.linkage_status,
    })),
    regla: "Estas referencias no tienen RUC exacto y no se atribuyen a proveedor, lote, contrato ni ranking. Requieren documento que publique la clave antes de vincularse.",
  });
}));

foodRouter.get("/observaciones-proveedor/:ruc", asyncHandler(async (req, res) => {
  const ruc = z.string().regex(/^\d{11}$/).safeParse(req.params.ruc);
  if (!ruc.success) { res.status(400).json({ error: "El RUC debe contener exactamente 11 dígitos." }); return; }
  const query = parseQuery(ObservationQuery, req.query, res);
  if (!query) return;
  const [observations, lots, compliance] = await Promise.all([
    pool.query(
      `SELECT observation_id,observation_kind,observation_status,authority_name,case_reference,food_lot_id,contract_reference,
              ruc_start_date,contract_date,source_url,source_detail,observed_at,linkage_status
         FROM supplier_observations
        WHERE ruc=$1 AND ($2::text IS NULL OR observation_kind=$2) AND ($3::text IS NULL OR observation_status=$3)
        ORDER BY observed_at DESC,observation_id DESC`, [ruc.data, query.tipo ?? null, query.estado ?? null],
    ),
    pool.query(
      "SELECT lot_id,contract_reference,item_literal FROM food_lots WHERE supplier_ruc=$1 ORDER BY lot_id", [ruc.data],
    ),
    supplierCompliance(ruc.data),
  ]);
  res.json({
    ruc: ruc.data,
    lotesMaterializados: lots.rows.map((row) => ({ id: row.lot_id, contrato: row.contract_reference, item: row.item_literal })),
    observaciones: observations.rows.map((row) => ({
      id: asNumber(row.observation_id), tipo: row.observation_kind, estado: row.observation_status,
      autoridad: row.authority_name, expediente: row.case_reference, lote: row.food_lot_id, contrato: row.contract_reference,
      antiguedadRucAlContratoDias: row.observation_kind === "ANTIGUEDAD_RUC" ? daysBetween(row.ruc_start_date, row.contract_date) : null,
      fechas: { inicioRuc: row.ruc_start_date, contrato: row.contract_date, observada: row.observed_at },
      fuente: { url: row.source_url, detalle: row.source_detail }, estadoVinculo: row.linkage_status,
    })),
    cumplimientoFuente: compliance,
    cautela: "Una denuncia o proceso en curso no acredita responsabilidad. La antigüedad del RUC es contexto al momento del contrato, no una conclusión. Las sanciones deben contrastarse con la fecha relevante del contrato.",
  });
}));

foodRouter.get("/evidencia-pendiente", asyncHandler(async (req, res) => {
  const query = parseQuery(QueueQuery, req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT q.queue_id,q.candidate_kind,q.lot_id,q.reason,q.evidence_urls,q.status,q.created_at,
            l.item_literal,l.contract_reference
       FROM food_evidence_review_queue q
       JOIN food_service_periods p ON p.period_id=q.period_id
       LEFT JOIN food_lots l ON l.lot_id=q.lot_id
      WHERE p.year=$1 AND ($2::text IS NULL OR q.status=$2)
      ORDER BY q.status,q.queue_id`, [query.periodo, query.estado ?? null],
  );
  res.json({
    anio: query.periodo,
    resultados: result.rows.map((row) => ({ id: asNumber(row.queue_id), tipo: row.candidate_kind, lote: row.lot_id, item: row.item_literal, contrato: row.contract_reference, motivo: row.reason, urlsEvidencia: row.evidence_urls, estado: row.status, creadoEn: row.created_at })),
    regla: "La cola orienta revisión humana. No convierte un candidato o una ausencia documental en hallazgo de incumplimiento.",
  });
}));

foodRouter.get("/integridad", asyncHandler(async (req, res) => {
  const query = parseQuery(PeriodQuery.extend({ estricto: z.enum(["true", "false"]).optional().default("false") }), req.query, res);
  if (!query) return;
  const result = await pool.query(
    `SELECT p.period_id,p.year,p.published_lots,p.awarded_lots,p.materialized_lots,p.planned_schools,p.school_denominator_status,p.coverage_status,p.limitation,
            b.source_url,b.source_label,b.extracted_at,b.automation_status,
            COUNT(DISTINCT l.lot_id)::int AS lotes_en_tabla,
            COUNT(DISTINCT l.lot_id) FILTER (WHERE l.supplier_ruc IS NOT NULL)::int AS lotes_con_ruc,
            COUNT(DISTINCT s.school_id)::int AS colegios_documentados,
            COUNT(DISTINCT d.delivery_id)::int AS entregas_con_acta,
            COUNT(DISTINCT q.queue_id) FILTER (WHERE q.status='PENDING')::int AS pendientes_revision
       FROM food_service_periods p
       JOIN food_evidence_batches b ON b.batch_id=p.source_batch_id
       LEFT JOIN food_lots l ON l.period_id=p.period_id
       LEFT JOIN food_schools s ON s.period_id=p.period_id
       LEFT JOIN food_delivery_evidence d ON d.school_id=s.school_id
       LEFT JOIN food_evidence_review_queue q ON q.period_id=p.period_id
      WHERE p.year=$1
      GROUP BY p.period_id,b.source_url,b.source_label,b.extracted_at,b.automation_status
      ORDER BY p.period_id`, [query.periodo],
  );
  const period = result.rows[0];
  if (!period) { periodNotFound(res, query.periodo); return; }
  const response = {
    periodo: { id: period.period_id, anio: asNumber(period.year) },
    estado: "BLOQUEADO_POR_EVIDENCIA" as const,
    controles: {
      lotesPublicados: period.published_lots === null ? null : asNumber(period.published_lots), lotesAdjudicadosPublicados: period.awarded_lots === null ? null : asNumber(period.awarded_lots),
      lotesMaterializadosDeclarados: asNumber(period.materialized_lots), lotesEnTabla: asNumber(period.lotes_en_tabla), lotesConRucExacto: asNumber(period.lotes_con_ruc),
      colegiosPublicados: period.planned_schools === null ? null : asNumber(period.planned_schools), colegiosDocumentados: asNumber(period.colegios_documentados), entregasConActaDocumentada: asNumber(period.entregas_con_acta), pendientesRevision: asNumber(period.pendientes_revision),
    },
    bloqueo: "No existe todavía un padrón oficial materializado de colegios ni RUC exacto de los proveedores documentados; por ello ALSOL no calcula cumplimiento de entrega, cobertura distrital ni concentración de proveedores.",
    fuente: { etiqueta: period.source_label, url: period.source_url, fechaExtraccion: period.extracted_at, automatizacion: period.automation_status },
    estadoCobertura: period.coverage_status, estadoDenominadorColegios: period.school_denominator_status, limitacion: period.limitation,
  };
  if (query.estricto === "true") { res.status(409).json(response); return; }
  res.json(response);
}));
