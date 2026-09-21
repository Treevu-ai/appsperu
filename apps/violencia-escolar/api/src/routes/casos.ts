import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const casosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * `new Date("2024-02-31")` no lanza error -- JS lo normaliza en silencio a 2024-03-02, así que
 * un simple regex de formato deja pasar fechas inexistentes como filtro (hallazgo real de
 * CodeRabbit en PR #179). Se reconstruye en UTC y se compara contra los componentes originales.
 */
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((text) => {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Fecha inválida (formato correcto, pero el día/mes no existe).");

const CasosQuerySchema = z.object({
  dre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  ugel: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  nivelEducativo: z.string().min(1).optional(),
  tipoReporte: z.enum(["Personal IE a Escolares", "Entre Escolares"]).optional(),
  tipoViolencia: z.enum(["Psicológica", "Física", "Sexual"]).optional(),
  subtipoViolencia: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  tipoEstadoReporte: z.string().min(1).optional(),
  fechaDesde: IsoDateSchema.optional(),
  fechaHasta: IsoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Listado de casos reportados a SíseVe. Sin `source_batch_id` explícito en el filtro: siempre
 * sirve el snapshot más reciente ingerido (`MAX(source_batch_id)`) -- cada ingesta es un
 * reemplazo completo del rango 01/01/2024-hoy, no incremental, así que mezclar batches
 * duplicaría casos.
 */
casosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CasosQuerySchema, req.query, res);
    if (!parsed) return;
    const { dre, ugel, nivelEducativo, tipoReporte, tipoViolencia, subtipoViolencia, tipoEstadoReporte, fechaDesde, fechaHasta, limit, offset } = parsed;

    // MAX(id) de raw_siseve_batches, NO MAX(source_batch_id) de violencia_escolar_casos: si el
    // batch más reciente terminara con 0 filas sobrevivientes (hipotético, ej. todas rechazadas),
    // MAX(source_batch_id) devolvería en silencio el batch anterior -- stale mostrado como
    // "más reciente" (hallazgo real de CodeRabbit en PR #179).
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
    // Params clonados para la query de listado -- LIMIT/OFFSET no deben mutar el array que ya
    // se le pasó (por referencia) a la query de conteo, corriendo en paralelo en el mismo
    // Promise.all.
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM violencia_escolar_casos WHERE ${whereSql}`, params),
      pool.query(
        `SELECT fecha_reporte, dre, ugel, nivel_educativo, tipo_reporte, tipo_violencia, subtipo_violencia, tipo_estado_reporte
         FROM violencia_escolar_casos
         WHERE ${whereSql}
         ORDER BY fecha_reporte DESC, id
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ),
    ]);

    const total = Number(countRows[0].total);

    res.json({
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
    });
  })
);
