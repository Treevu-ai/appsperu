import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ResumenRow extends NeonRow {
  territorio: string;
  psicologica: string;
  fisica: string;
  sexual: string;
  total: string;
}

/**
 * Handler para `violencia_escolar_resumen` — GET /api/resumen.
 * Origen: apps/violencia-escolar/api/src/routes/resumen.ts. SQL idéntico.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const dre = args.dre as string | undefined;

  const groupCol = dre ? "ugel" : "dre";
  const conditions: string[] = ["source_batch_id = (SELECT MAX(id) FROM raw_siseve_batches)"];
  const params: unknown[] = [];
  if (dre) {
    params.push(`%${dre}%`);
    conditions.push(`dre ILIKE $${params.length}`);
  }

  const { rows } = await db.query<ResumenRow>(
    `SELECT ${groupCol} AS territorio,
            COUNT(*) FILTER (WHERE tipo_violencia = 'Psicológica')::int AS psicologica,
            COUNT(*) FILTER (WHERE tipo_violencia = 'Física')::int AS fisica,
            COUNT(*) FILTER (WHERE tipo_violencia = 'Sexual')::int AS sexual,
            COUNT(*)::int AS total
     FROM violencia_escolar_casos
     WHERE ${conditions.join(" AND ")}
     GROUP BY ${groupCol}
     ORDER BY total DESC`,
    params
  );

  return {
    status: 200,
    body: {
      agregadoPor: dre ? "ugel" : "dre",
      dre: dre ?? null,
      resultados: rows.map((r) => ({
        territorio: r.territorio,
        psicologica: Number(r.psicologica),
        fisica: Number(r.fisica),
        sexual: Number(r.sexual),
        total: Number(r.total),
      })),
      fuente: { dataset: "SíseVe/MINEDU - Listado detallado de casos reportados" },
    },
  };
}
