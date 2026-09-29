import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CasoRow extends NeonRow {
  fecha_reporte: string;
  dre: string;
  ugel: string;
  nivel_educativo: string;
  tipo_reporte: string;
  tipo_violencia: string;
  subtipo_violencia: string;
  tipo_estado_reporte: string;
}

/**
 * `new Date("2024-02-31")` no lanza error -- JS lo normaliza en silencio,
 * así que se reconstruye en UTC y se compara contra los componentes
 * originales (hallazgo real de CodeRabbit, ver route Express de origen).
 */
function isValidIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Handler para `violencia_escolar_casos` — GET /api/casos.
 * Origen: apps/violencia-escolar/api/src/routes/casos.ts. SQL idéntico
 * (incluye el filtro `source_batch_id = (SELECT MAX(id) FROM raw_siseve_batches)`
 * para servir siempre el snapshot más reciente).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const dre = args.dre as string | undefined;
  const ugel = args.ugel as string | undefined;
  const nivelEducativo = args.nivelEducativo as string | undefined;
  const tipoReporte = args.tipoReporte as string | undefined;
  const tipoViolencia = args.tipoViolencia as string | undefined;
  const subtipoViolencia = args.subtipoViolencia as string | undefined;
  const tipoEstadoReporte = args.tipoEstadoReporte as string | undefined;
  const fechaDesdeRaw = args.fechaDesde as string | undefined;
  const fechaHastaRaw = args.fechaHasta as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const fechaDesde = fechaDesdeRaw && isValidIsoDate(fechaDesdeRaw) ? fechaDesdeRaw : undefined;
  const fechaHasta = fechaHastaRaw && isValidIsoDate(fechaHastaRaw) ? fechaHastaRaw : undefined;

  const conditions: string[] = ["source_batch_id = (SELECT MAX(id) FROM raw_siseve_batches)"];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

  if (dre) addIlike("dre", dre);
  if (ugel) addIlike("ugel", ugel);
  if (nivelEducativo) conditions.push(`nivel_educativo = ${addParam(nivelEducativo)}`);
  if (tipoReporte) conditions.push(`tipo_reporte = ${addParam(tipoReporte)}`);
  if (tipoViolencia) conditions.push(`tipo_violencia = ${addParam(tipoViolencia)}`);
  if (subtipoViolencia) addIlike("subtipo_violencia", subtipoViolencia);
  if (tipoEstadoReporte) conditions.push(`tipo_estado_reporte = ${addParam(tipoEstadoReporte)}`);
  if (fechaDesde) conditions.push(`fecha_reporte >= ${addParam(fechaDesde)}`);
  if (fechaHasta) conditions.push(`fecha_reporte <= ${addParam(fechaHasta)}`);

  const whereSql = conditions.join(" AND ");
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM violencia_escolar_casos WHERE ${whereSql}`,
    params
  );
  const { rows } = await db.query<CasoRow>(
    `SELECT fecha_reporte, dre, ugel, nivel_educativo, tipo_reporte, tipo_violencia, subtipo_violencia, tipo_estado_reporte
     FROM violencia_escolar_casos
     WHERE ${whereSql}
     ORDER BY fecha_reporte DESC, id
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    listParams
  );

  const total = Number(countRows[0].total);

  return {
    status: 200,
    body: {
      total,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        fechaReporte: r.fecha_reporte,
        dre: r.dre,
        ugel: r.ugel,
        nivelEducativo: r.nivel_educativo,
        tipoReporte: r.tipo_reporte,
        tipoViolencia: r.tipo_violencia,
        subtipoViolencia: r.subtipo_violencia,
        tipoEstadoReporte: r.tipo_estado_reporte,
      })),
      fuente: {
        dataset: "SíseVe/MINEDU - Listado detallado de casos reportados",
        nota: "Sin PII (sin nombre/DNI/identificador de alumno o IE individual). Snapshot más reciente ingerido, no acumulativo entre corridas.",
      },
    },
  };
}
