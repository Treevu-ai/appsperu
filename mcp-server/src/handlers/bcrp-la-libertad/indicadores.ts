import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface IndicadorRow extends NeonRow {
  anexo_numero: number;
  seccion: string | null;
  indicador: string;
  periodo_anio: number;
  periodo_mes: number | null;
  valor: number | string | null;
  report_period: string;
}

/**
 * Handler para `bcrp_la_libertad_indicadores` — GET /api/indicadores.
 * Origen: apps/bcrp-la-libertad/api/src/routes/indicadores.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anexo = args.anexo !== undefined ? Number(args.anexo) : undefined;
  const indicador = args.indicador as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const mes = args.mes !== undefined ? Number(args.mes) : undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (anexo !== undefined) {
    values.push(anexo);
    conditions.push(`i.anexo_numero = $${values.length}`);
  }
  if (indicador) {
    values.push(`%${indicador}%`);
    conditions.push(`i.indicador ILIKE $${values.length}`);
  }
  if (anio !== undefined) {
    values.push(anio);
    conditions.push(`i.periodo_anio = $${values.length}`);
  }
  if (mes !== undefined) {
    values.push(mes);
    conditions.push(`i.periodo_mes = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<IndicadorRow>(
    `SELECT i.anexo_numero, i.seccion, i.indicador, i.periodo_anio, i.periodo_mes, i.valor, rb.report_period
     FROM bcrp_ll_indicators i
     JOIN raw_bcrp_ll_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.anexo_numero, i.seccion, i.indicador, i.periodo_anio, i.periodo_mes`,
    values
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anexoNumero: r.anexo_numero,
        seccion: r.seccion || null,
        indicador: r.indicador,
        periodoAnio: r.periodo_anio,
        periodoMes: r.periodo_mes,
        valor: r.valor === null ? null : Number(r.valor),
        fuente: { dataset: "BCRP Sucursal Trujillo — Síntesis de Actividad Económica de La Libertad", reportePeriod: r.report_period },
      })),
    },
  };
}
