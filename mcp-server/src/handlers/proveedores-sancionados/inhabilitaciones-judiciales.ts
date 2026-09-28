import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InhabilitacionJudicialRow extends NeonRow {
  fecha_corte: string | null;
  ruc_dni: string | null;
  nombre: string | null;
  organo_jurisdiccional: string | null;
  numero_resolucion: string | null;
  fecha_inicio: string | Date | null;
  fecha_fin: string | Date | null;
}

/**
 * Handler para `proveedores_sancionados_inhabilitaciones_judiciales` —
 * GET /api/inhabilitaciones-judiciales.
 *
 * Inhabilitaciones dictadas por el Poder Judicial (comunicadas a OSCE/OECE para
 * su registro en el RNP) — base legal distinta a las sanciones administrativas
 * del Tribunal de Contrataciones. No hay cruce automático entre ambas: un mismo
 * RUC/DNI puede aparecer en una, la otra, ambas, o ninguna.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const rucDni = args.rucDni as string | undefined;
  const dni = args.dni as string | undefined;
  const limit = args.limit !== undefined ? Number(args.limit) : 200;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (rucDni) {
    params.push(rucDni);
    conditions.push(`ruc_dni = $${params.length}`);
  }
  if (dni) {
    params.push(dni);
    conditions.push(`dni = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM inhabilitaciones_judiciales ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<InhabilitacionJudicialRow>(
    `SELECT fecha_corte, ruc_dni, nombre, organo_jurisdiccional, numero_resolucion, fecha_inicio, fecha_fin
     FROM inhabilitaciones_judiciales ${where}
     ORDER BY fecha_inicio DESC NULLS LAST
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
        fechaCorte: r.fecha_corte,
        rucDni: r.ruc_dni,
        nombre: r.nombre,
        organoJurisdiccional: r.organo_jurisdiccional,
        numeroResolucion: r.numero_resolucion,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
      })),
      limitation:
        "Base legal distinta a las inhabilitaciones/multas del Tribunal de Contrataciones (GET /api/sanciones): esto es inhabilitación por mandato judicial, comunicada al OSCE/OECE por el Poder Judicial. No se cruza automáticamente con esa otra fuente.",
    },
  };
}
