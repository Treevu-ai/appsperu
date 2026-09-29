import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PeaceMissionRow extends NeonRow {
  mision: string;
  modalidad: string;
  institucion: string;
  pais: string;
  anio: number;
  cantidad: number | string;
  fetched_at: string;
}

/**
 * Handler para `mindef_peace_missions` — GET /api/peace-missions.
 * SQL idéntico a `apps/mindef/api/src/routes/peace-missions.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const pais = args.pais as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`p.anio = $${params.length}`);
  }
  if (pais) {
    params.push(`%${pais}%`);
    conditions.push(`p.pais ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<PeaceMissionRow>(
    `SELECT p.mision, p.modalidad, p.institucion, p.pais, p.anio, p.cantidad, rb.fetched_at
     FROM peace_missions p
     JOIN raw_mindef_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.anio DESC, p.mision`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        mision: r.mision,
        modalidad: r.modalidad,
        institucion: r.institucion,
        pais: r.pais,
        anio: r.anio,
        cantidad: Number(r.cantidad),
        fuente: { dataset: "MINDEF - Cuadro anual de personal FF.AA en Misiones de Paz", extraidoEl: r.fetched_at },
      })),
    },
  };
}
