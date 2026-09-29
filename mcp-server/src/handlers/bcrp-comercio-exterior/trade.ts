import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface TradeRow extends NeonRow {
  series_code: string;
  series_key: string;
  series_title: string;
  category: string;
  unit: string;
  period_year: number;
  period_month: number;
  value_usd_millions: number | string;
}

const selectFields = "series_code, series_key, series_title, category, unit, period_year, period_month, value_usd_millions";

function buildWhere(args: Record<string, unknown>): { where: string; values: unknown[] } {
  const series = args.series as string | undefined;
  const category = args.category as string | undefined;
  const anio = args.anio as string | undefined;
  const desde = args.desde as string | undefined;
  const hasta = args.hasta as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (series) {
    values.push(series);
    conditions.push(`series_key = $${values.length}`);
  }
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (anio) {
    values.push(Number(anio));
    conditions.push(`period_year = $${values.length}`);
  }
  if (desde) {
    const [year, month] = desde.split("-").map(Number);
    values.push(year, month);
    conditions.push(`(period_year > $${values.length - 1} OR (period_year = $${values.length - 1} AND period_month >= $${values.length}))`);
  }
  if (hasta) {
    const [year, month] = hasta.split("-").map(Number);
    values.push(year, month);
    conditions.push(`(period_year < $${values.length - 1} OR (period_year = $${values.length - 1} AND period_month <= $${values.length}))`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { where, values };
}

/**
 * Handler para `bcrp_comercio_exterior_trade` — GET /api/trade.
 * SQL idéntico a `apps/bcrp-comercio-exterior/api/src/routes/trade.ts`.
 */
export async function trade(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const { where, values } = buildWhere(args);

  const { rows } = await db.query<TradeRow>(
    `SELECT ${selectFields}
     FROM trade_indicators
     ${where}
     ORDER BY period_year, period_month, series_key`,
    values
  );

  return { status: 200, body: { resultados: rows, cobertura: "nacional_agregado", isPartial: false } };
}

/**
 * Handler para `bcrp_comercio_exterior_macro` — GET /api/trade/macro.
 * Mismo SQL que `trade` en la ruta Express de origen (ambos endpoints leen la
 * misma tabla `trade_indicators`; la diferencia la hace `series`/`category`).
 */
export async function macro(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const { where, values } = buildWhere(args);

  const { rows } = await db.query<TradeRow>(
    `SELECT ${selectFields}
     FROM trade_indicators
     ${where}
     ORDER BY period_year, period_month, series_key`,
    values
  );

  return { status: 200, body: { resultados: rows, cobertura: "nacional_agregado", isPartial: false } };
}
