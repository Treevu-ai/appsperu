import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface Chat100Row extends NeonRow {
  anio_reporte: number;
  periodo: string;
  consultas_total: number | string | null;
  consultas_hombres: number | string | null;
  consultas_mujeres: number | string | null;
  consultas_no_especifica_sexo: number | string | null;
  fetched_at: string;
}

/**
 * Handler para `mimp_chat100_consultas` — GET /api/chat100.
 * Origen: apps/mimp/api/src/routes/chat100.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`ch.anio_reporte = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<Chat100Row>(
    `SELECT ch.anio_reporte, ch.periodo, ch.consultas_total, ch.consultas_hombres,
            ch.consultas_mujeres, ch.consultas_no_especifica_sexo, rb.fetched_at
     FROM chat100_consultas ch
     JOIN raw_mimp_batches rb ON rb.id = ch.source_batch_id
     ${where}
     ORDER BY ch.anio_reporte DESC`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anioReporte: r.anio_reporte,
        periodo: r.periodo,
        consultasTotal: r.consultas_total === null ? null : Number(r.consultas_total),
        consultasHombres: r.consultas_hombres === null ? null : Number(r.consultas_hombres),
        consultasMujeres: r.consultas_mujeres === null ? null : Number(r.consultas_mujeres),
        consultasNoEspecificaSexo: r.consultas_no_especifica_sexo === null ? null : Number(r.consultas_no_especifica_sexo),
        fuente: { dataset: "MIMP - Consultas atendidas por el servicio Chat 100, agregado nacional anual", extraidoEl: r.fetched_at },
      })),
    },
  };
}
