import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PortImportRow extends NeonRow {
  aduana_code: number;
  aduana_name: string;
  year: number;
  quarter: number | null;
  is_total: boolean;
  value_cif_usd: string;
}

interface SubpartidaImportRow extends NeonRow {
  aduana_code: number;
  aduana_name: string;
  year: number;
  subpartida: string;
  product_desc: string;
  value_fob_usd: string;
  value_cif_usd: string;
  pct_change: string | null;
  pct_structure: string | null;
}

interface TopRow extends NeonRow {
  aduana_code: number;
  aduana_name: string;
  year: number;
  total_cif_usd: string;
}

/**
 * Handler para `sunat_aduanas_ports` — GET /api/ports. Importaciones CIF por
 * aduana y año (trimestral + total anual). Origen: cdro_15, apps/sunat-aduanas/api/src/routes/ports.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const aduana = args.aduana as string | undefined;
  const anio = args.anio as string | undefined;
  const desde = args.desde as string | undefined;
  const hasta = args.hasta as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;

  const cond: string[] = [];
  const vals: unknown[] = [];

  if (aduana) { vals.push(aduana); cond.push(`LOWER(aduana_name) LIKE $${vals.length}`); }
  if (anio) { vals.push(Number(anio)); cond.push(`year = $${vals.length}`); }
  if (desde) { vals.push(Number(desde)); cond.push(`year >= $${vals.length}`); }
  if (hasta) { vals.push(Number(hasta)); cond.push(`year <= $${vals.length}`); }

  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";

  const { rows } = await db.query<PortImportRow>(
    `SELECT aduana_code, aduana_name, year, quarter, is_total, value_cif_usd
     FROM port_imports
     ${where}
     ORDER BY year DESC, aduana_name, quarter NULLS LAST`,
    vals
  );

  return {
    status: 200,
    body: { resultados: rows.slice(0, limit), fuente: "SUNAT cdro_15", cobertura: "nacional" },
  };
}

/**
 * Handler para `sunat_aduanas_ports_subpartidas` — GET /api/ports/subpartidas.
 * Importaciones por aduana + subpartida. Origen: cdro_16.
 */
export async function subpartidas(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const aduana = args.aduana as string | undefined;
  const anio = args.anio as string | undefined;
  const desde = args.desde as string | undefined;
  const hasta = args.hasta as string | undefined;
  const subpartida = args.subpartida as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;

  const cond: string[] = [];
  const vals: unknown[] = [];

  if (aduana) { vals.push(aduana); cond.push(`LOWER(aduana_name) LIKE $${vals.length}`); }
  if (anio) { vals.push(Number(anio)); cond.push(`year = $${vals.length}`); }
  if (desde) { vals.push(Number(desde)); cond.push(`year >= $${vals.length}`); }
  if (hasta) { vals.push(Number(hasta)); cond.push(`year <= $${vals.length}`); }
  if (subpartida) { vals.push(subpartida); cond.push(`subpartida LIKE $${vals.length}`); }

  const where = cond.length ? "WHERE " + cond.join(" AND ") : "";

  const { rows } = await db.query<SubpartidaImportRow>(
    `SELECT aduana_code, aduana_name, year, subpartida, product_desc,
            value_fob_usd, value_cif_usd, pct_change, pct_structure
     FROM port_subpartida_imports
     ${where}
     ORDER BY year DESC, aduana_name, value_fob_usd DESC`,
    vals
  );

  return {
    status: 200,
    body: { resultados: rows.slice(0, limit), fuente: "SUNAT cdro_16", cobertura: "nacional" },
  };
}

/**
 * Handler para `sunat_aduanas_ports_top` — GET /api/ports/top. Ranking de
 * aduanas por volumen CIF total en un año.
 */
export async function top(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio as string;

  const { rows } = await db.query<TopRow>(
    `SELECT aduana_code, aduana_name, year,
            MAX(value_cif_usd) FILTER (WHERE is_total = true) as total_cif_usd
     FROM port_imports
     WHERE year = $1 AND is_total = true
     GROUP BY aduana_code, aduana_name, year
     ORDER BY total_cif_usd DESC`,
    [Number(anio)]
  );

  return {
    status: 200,
    body: { resultados: rows, fuente: "SUNAT cdro_15", cobertura: "nacional" },
  };
}
