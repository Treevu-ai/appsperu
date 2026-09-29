import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ResumenRow extends NeonRow {
  provincia: string;
  distrito: string;
  total: number;
  activas: number;
}

/**
 * Handler para `instituciones_educativas_resumen` — GET /api/resumen.
 * SQL idéntico a `apps/instituciones-educativas/api/src/routes/resumen.ts`.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = (args.departamento as string | undefined) ?? "LA LIBERTAD";

  const { rows } = await db.query<ResumenRow>(
    `SELECT i.provincia, i.distrito,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE i.estado = 'Activo')::int AS activas
     FROM instituciones_educativas i
     WHERE i.departamento ILIKE $1
     GROUP BY i.provincia, i.distrito
     ORDER BY i.provincia, i.distrito`,
    [departamento]
  );

  return {
    status: 200,
    body: {
      departamento,
      distritos: rows.map((r) => ({
        provincia: r.provincia,
        distrito: r.distrito,
        totalInstituciones: r.total,
        institucionesActivas: r.activas,
      })),
      fuente: { dataset: "MINEDU/ESCALE - Padrón de Instituciones Educativas" },
    },
  };
}
