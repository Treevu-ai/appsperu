import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EjecucionRow extends NeonRow {
  anio: number;
  descripcion: string;
  fuente: string;
  ejecutado: number | string | null;
}

/**
 * Handler para `onp_presupuesto_ejecucion` — GET /api/ejecucion.
 * Origen: apps/onp-presupuesto/api/src/routes/ejecucion.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const descripcion = args.descripcion as string | undefined;
  const fuente = args.fuente as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio !== undefined) {
    params.push(anio);
    conditions.push(`anio = $${params.length}`);
  }
  if (descripcion) {
    params.push(`%${descripcion}%`);
    conditions.push(`descripcion ILIKE $${params.length}`);
  }
  if (fuente) {
    params.push(fuente);
    conditions.push(`fuente = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ejecucion_presupuestal_onp ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<EjecucionRow>(
    `SELECT anio, descripcion, fuente, ejecutado
     FROM ejecucion_presupuestal_onp
     ${where}
     ORDER BY anio DESC, descripcion, fuente, id
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        anio: r.anio,
        descripcion: r.descripcion,
        fuente: r.fuente,
        ejecutado: r.ejecutado === null ? null : Number(r.ejecutado),
      })),
      fuente: { dataset: "ONP - Ejecución Presupuestal de los Regímenes Administrados" },
    },
  };
}
