import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const GROUP_BY_COLUMNS = {
  sectorEntidad: "sector_entidad",
  nivelGobierno: "nivel_gobierno",
  naturalezaObra: "naturaleza_obra",
  modalidadEjecucion: "modalidad_ejecucion",
  causalParalizacion: "causal_paralizacion",
} as const;

const ORDER_BY_COLUMNS = {
  nombre_asc: "pw.nombre_obra ASC",
  diasParalizado_desc: "pw.dias_paralizado DESC NULLS LAST",
  montoViable_desc: "pw.monto_viable DESC NULLS LAST",
} as const;

interface PublicWorkRow extends NeonRow {
  codigo_infobras: string;
  codigo_entidad: string;
  entidad_nombre: string;
  nombre_obra: string;
  modalidad_ejecucion: string;
  naturaleza_obra: string;
  estado_ejecucion: string;
  nivel_gobierno: string;
  sector_entidad: string;
  cui: string;
  departamento: string;
  provincia: string;
  distrito: string;
  distrito_sospechoso: boolean;
  monto_viable: number | string | null;
  costo_actualizado: number | string | null;
  avance_fisico_prog_pct: number | string | null;
  avance_fisico_real_pct: number | string | null;
  ejecucion_financiera_pct: number | string | null;
  existe_paralizacion: boolean;
  causal_paralizacion: string | null;
  fecha_paralizacion: string | null;
  dias_paralizado: number | string | null;
  fetched_at: string;
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function costDriftPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable === 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 10000) / 100;
}

function gapFisicoFinanciero(avanceFisicoRealPct: number | null, ejecucionFinancieraPct: number | null): number | null {
  if (avanceFisicoRealPct === null || ejecucionFinancieraPct === null) return null;
  return Math.round((avanceFisicoRealPct - ejecucionFinancieraPct) * 100) / 100;
}

function withSignals(row: PublicWorkRow) {
  const montoViable = toNumberOrNull(row.monto_viable);
  const costoActualizado = toNumberOrNull(row.costo_actualizado);
  const avanceFisicoRealPct = toNumberOrNull(row.avance_fisico_real_pct);
  const ejecucionFinancieraPct = toNumberOrNull(row.ejecucion_financiera_pct);

  return {
    codigoInfobras: row.codigo_infobras,
    codigoEntidad: row.codigo_entidad,
    entidadNombre: row.entidad_nombre,
    nombreObra: row.nombre_obra,
    modalidadEjecucion: row.modalidad_ejecucion,
    naturalezaObra: row.naturaleza_obra,
    estadoEjecucion: row.estado_ejecucion,
    nivelGobierno: row.nivel_gobierno,
    sectorEntidad: row.sector_entidad,
    cui: row.cui,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    distritoSospechoso: row.distrito_sospechoso,
    montoViable,
    costoActualizado,
    avanceFisicoProgPct: toNumberOrNull(row.avance_fisico_prog_pct),
    avanceFisicoRealPct,
    ejecucionFinancieraPct,
    existeParalizacion: row.existe_paralizacion,
    causalParalizacion: row.causal_paralizacion,
    fechaParalizacion: row.fecha_paralizacion,
    diasParalizado: row.dias_paralizado,
    costDriftPct: costDriftPct(montoViable, costoActualizado),
    gapFisicoFinanciero: gapFisicoFinanciero(avanceFisicoRealPct, ejecucionFinancieraPct),
    fuente: { dataset: "INFOBRAS - Datos Abiertos (Contraloría)", extraidoEl: row.fetched_at },
  };
}

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10000) / 100;
}

/**
 * Handler para `infobras_public_works` — GET /api/public-works.
 *
 * Lista obras públicas INFOBRAS con filtros y señales derivadas (costDriftPct,
 * gapFisicoFinanciero). El SQL usa `pw.*` + `fetched_at` del batch de origen,
 * igual que la ruta Express.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined)?.toUpperCase();
  const estado = args.estado as string | undefined;
  const conParalizacion = args.conParalizacion as string | undefined;
  const distritoSospechoso = args.distritoSospechoso as string | undefined;
  const sectorEntidad = args.sectorEntidad as string | undefined;
  const diasParalizadoMin = args.diasParalizadoMin !== undefined ? Number(args.diasParalizadoMin) : undefined;
  const orderBy = (args.orderBy as string | undefined) ?? "nombre_asc";

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(departamento);
    conditions.push(`pw.departamento = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    conditions.push(`pw.estado_ejecucion = $${params.length}`);
  }
  if (conParalizacion === "true") {
    conditions.push("pw.existe_paralizacion = true");
  }
  if (distritoSospechoso === "true") {
    conditions.push("pw.distrito_sospechoso = true");
  } else if (distritoSospechoso === "false") {
    conditions.push("pw.distrito_sospechoso = false");
  }
  if (sectorEntidad) {
    params.push(sectorEntidad);
    conditions.push(`pw.sector_entidad = $${params.length}`);
  }
  if (diasParalizadoMin !== undefined) {
    params.push(diasParalizadoMin);
    conditions.push(`pw.dias_paralizado >= $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<PublicWorkRow>(
    `SELECT pw.*, rb.fetched_at
       FROM public_works pw
       JOIN raw_infobras_batches rb ON rb.id = pw.source_batch_id
       ${where}
       ORDER BY ${ORDER_BY_COLUMNS[orderBy as keyof typeof ORDER_BY_COLUMNS]}`,
    params,
  );

  return {
    status: 200,
    body: { resultados: rows.map(withSignals) },
  };
}

/**
 * Handler para `infobras_public_works_resumen` — GET /api/public-works/resumen.
 *
 * Resumen agregado con porcentajes de paralización, avance reportado y
 * distritos sospechosos. Soporta `groupBy` (DQ-06) validado por enum.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined)?.toUpperCase();
  const groupBy = args.groupBy as keyof typeof GROUP_BY_COLUMNS | undefined;

  const params: unknown[] = [];
  let where = "";
  if (departamento) {
    params.push(departamento);
    where = "WHERE departamento = $1";
  }

  const { rows } = await db.query<NeonRow>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE existe_paralizacion) AS con_paralizacion,
       COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL) AS con_avance_reportado,
       COUNT(*) FILTER (WHERE distrito_sospechoso) AS con_distrito_sospechoso
     FROM public_works
     ${where}`,
    params,
  );

  const total = Number(rows[0].total);
  const body: Record<string, unknown> = {
    totalObras: total,
    conParalizacionPct: pct(Number(rows[0].con_paralizacion), total),
    conAvanceReportadoPct: pct(Number(rows[0].con_avance_reportado), total),
    conDistritoSospechoso: Number(rows[0].con_distrito_sospechoso),
  };

  if (groupBy) {
    const column = GROUP_BY_COLUMNS[groupBy];
    const { rows: groupRows } = await db.query<NeonRow>(
      `SELECT ${column} AS grupo,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE existe_paralizacion) AS con_paralizacion,
              COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL) AS con_avance_reportado
       FROM public_works
       ${where}
       GROUP BY ${column}
       ORDER BY total DESC`,
      params,
    );
    body.groupBy = groupBy;
    body.porGrupo = groupRows.map((r) => {
      const grupoTotal = Number(r.total);
      return {
        grupo: r.grupo,
        total: grupoTotal,
        conParalizacionPct: pct(Number(r.con_paralizacion), grupoTotal),
        conAvanceReportadoPct: pct(Number(r.con_avance_reportado), grupoTotal),
      };
    });
  }

  return { status: 200, body };
}

/**
 * Handler para `infobras_public_work_by_codigo` — GET /api/public-works/{codigoInfobras}.
 *
 * Detalle de una obra por su código INFOBRAS. 404 si no existe en los datos
 * ingeridos.
 */
export async function byCodigo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const codigoInfobras = args.codigoInfobras as string;

  const { rows } = await db.query<PublicWorkRow>(
    `SELECT pw.*, rb.fetched_at
       FROM public_works pw
       JOIN raw_infobras_batches rb ON rb.id = pw.source_batch_id
       WHERE pw.codigo_infobras = $1`,
    [codigoInfobras],
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Obra no encontrada en los datos ingeridos." } };
  }

  return { status: 200, body: withSignals(rows[0]) };
}