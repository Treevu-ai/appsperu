import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const indicadoresRouter = Router();

const IndicadoresQuerySchema = z.object({
  anexo: z.coerce.number().int().min(1).optional(),
  indicador: z.string().min(1).optional(),
  anio: z.coerce.number().int().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * Serie genérica de indicadores de "LA LIBERTAD: Síntesis de Actividad
 * Económica" (BCRP Sucursal Trujillo) — ingesta manual, sin descarga
 * automática (ver ADR-0014). `anexo` identifica la tabla de origen del PDF
 * (1=agropecuario, 2=pesca, 3=minería, 4/5=manufactura, 6=crédito,
 * 7=morosidad, 8=depósitos, 9=importaciones Salaverry,
 * 10=ejecución presupuestal).
 */
indicadoresRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(IndicadoresQuerySchema, req.query, res);
    if (!parsed) return;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (parsed.anexo !== undefined) {
      values.push(parsed.anexo);
      conditions.push(`i.anexo_numero = $${values.length}`);
    }
    if (parsed.indicador) {
      values.push(`%${parsed.indicador}%`);
      conditions.push(`i.indicador ILIKE $${values.length}`);
    }
    if (parsed.anio !== undefined) {
      values.push(parsed.anio);
      conditions.push(`i.periodo_anio = $${values.length}`);
    }
    if (parsed.mes !== undefined) {
      values.push(parsed.mes);
      conditions.push(`i.periodo_mes = $${values.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT i.anexo_numero, i.seccion, i.indicador, i.periodo_anio, i.periodo_mes, i.valor, rb.report_period
       FROM bcrp_ll_indicators i
       JOIN raw_bcrp_ll_batches rb ON rb.id = i.source_batch_id
       ${where}
       ORDER BY i.anexo_numero, i.seccion, i.indicador, i.periodo_anio, i.periodo_mes`,
      values
    );

    res.json({
      resultados: rows.map((r) => ({
        anexoNumero: r.anexo_numero,
        seccion: r.seccion || null,
        indicador: r.indicador,
        periodoAnio: r.periodo_anio,
        periodoMes: r.periodo_mes,
        valor: r.valor === null ? null : Number(r.valor),
        fuente: { dataset: "BCRP Sucursal Trujillo — Síntesis de Actividad Económica de La Libertad", reportePeriod: r.report_period },
      })),
    });
  })
);
