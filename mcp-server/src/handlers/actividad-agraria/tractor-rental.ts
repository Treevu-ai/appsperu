import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface RegionalMonthlyRow extends NeonRow {
  departamento: string;
  anio: number;
  mes: number;
  valor_soles: number | string | null;
}

/**
 * @fidelity: precomputado
 *
 * Handler para `actividad_agraria_tractor_rental` — GET /api/tractor-rental.
 * Igual que `createRegionalMonthlyRouter("agricultural_tractor_rental")` en
 * `apps/actividad-agraria/api/src/routes/regional-monthly.ts`: el route de
 * origen (`routes/tractor-rental.ts`) solo llama a esa factoría con el
 * nombre de tabla, así que el SQL en sí (con `${tableName}` interpolado) no
 * vive literalmente en `routes/tractor-rental.ts`. El SELECT es idéntico al
 * de la factoría.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const departamento = args.departamento as string | undefined;
  const anio = args.anio as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    values.push(departamento.toUpperCase());
    conditions.push(`departamento = $${values.length}`);
  }
  if (anio) {
    values.push(Number(anio));
    conditions.push(`anio = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // @nuevo: port literal de createRegionalMonthlyRouter("agricultural_tractor_rental") en apps/actividad-agraria/api/src/routes/regional-monthly.ts (SQL con ${tableName} interpolado, no vive literal en routes/tractor-rental.ts)
  const { rows } = await db.query<RegionalMonthlyRow>(
    `SELECT departamento, anio, mes, valor_soles
     FROM agricultural_tractor_rental
     ${where}
     ORDER BY departamento, anio, mes`,
    values
  );

  return { status: 200, body: { resultados: rows } };
}
