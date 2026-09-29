import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface TrainingAbroadRow extends NeonRow {
  institucion: string;
  capacitacion: string;
  personal_cantidad: number | string;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  pais: string;
  fetched_at: string;
}

/**
 * Handler para `mindef_training_abroad` — GET /api/training-abroad.
 * SQL idéntico a `apps/mindef/api/src/routes/training-abroad.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const pais = args.pais as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (pais) {
    params.push(pais.toUpperCase());
    conditions.push(`t.pais = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<TrainingAbroadRow>(
    `SELECT t.institucion, t.capacitacion, t.personal_cantidad, t.fecha_inicio, t.fecha_termino,
            t.pais, rb.fetched_at
     FROM training_abroad t
     JOIN raw_mindef_batches rb ON rb.id = t.source_batch_id
     ${where}
     ORDER BY t.fecha_inicio DESC NULLS LAST`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        institucion: r.institucion,
        capacitacion: r.capacitacion,
        personalCantidad: Number(r.personal_cantidad),
        fechaInicio: r.fecha_inicio,
        fechaTermino: r.fecha_termino,
        pais: r.pais,
        fuente: { dataset: "MINDEF - Consolidado del Personal Militar capacitado en el Exterior", extraidoEl: r.fetched_at },
      })),
    },
  };
}
