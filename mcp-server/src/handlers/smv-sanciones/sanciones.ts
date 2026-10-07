import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface SancionRow extends NeonRow {
  fecha_resolucion: string | null;
  nro_resolucion: string;
  empresa: string;
  sumilla: string | null;
  tipo: string | null;
  monto: number | string | null;
  con_recurso: boolean | null;
  nro_res_resolutiva: string | null;
  fecha_res_resolutiva: string | null;
}

/**
 * Handler para `smv_sanciones_sanciones` — GET /api/sanciones.
 * Origen: apps/smv-sanciones/api/src/routes/sanciones.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const empresa = args.empresa as string | undefined;
  const tipo = args.tipo as string | undefined;
  const fechaInicio = args.fechaInicio as string | undefined;
  const fechaFin = args.fechaFin as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (empresa) {
    params.push(`%${empresa}%`);
    conditions.push(`empresa ILIKE $${params.length}`);
  }
  if (tipo) {
    params.push(`%${tipo}%`);
    conditions.push(`tipo ILIKE $${params.length}`);
  }
  if (fechaInicio) {
    params.push(fechaInicio);
    conditions.push(`fecha_resolucion >= $${params.length}`);
  }
  if (fechaFin) {
    params.push(fechaFin);
    conditions.push(`fecha_resolucion <= $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM sanciones_smv ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<SancionRow>(
    `SELECT fecha_resolucion, nro_resolucion, empresa, sumilla, tipo, monto,
            con_recurso, nro_res_resolutiva, fecha_res_resolutiva
     FROM sanciones_smv
     ${where}
     ORDER BY fecha_resolucion DESC, id
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
        fechaResolucion: r.fecha_resolucion,
        nroResolucion: r.nro_resolucion,
        empresa: r.empresa,
        sumilla: r.sumilla,
        tipo: r.tipo,
        monto: r.monto === null ? null : Number(r.monto),
        conRecurso: r.con_recurso,
        nroResResolutiva: r.nro_res_resolutiva,
        fechaResResolutiva: r.fecha_res_resolutiva,
      })),
      fuente: { dataset: "SMV - Sanciones a personas jurídicas" },
    },
  };
}
