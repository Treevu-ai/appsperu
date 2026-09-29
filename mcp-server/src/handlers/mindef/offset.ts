import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface OffsetRow extends NeonRow {
  tipo_convenio: string;
  institucion: string;
  titulo: string;
  entidad_contraparte: string;
  observacion: string | null;
  anio_inicio: number | null;
  fetched_at: string;
}

/**
 * Handler para `mindef_offset_agreements` — GET /api/offset-agreements.
 * SQL idéntico a `apps/mindef/api/src/routes/offset.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const entidadContraparte = args.entidadContraparte as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (entidadContraparte) {
    params.push(`%${entidadContraparte}%`);
    conditions.push(`o.entidad_contraparte ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<OffsetRow>(
    `SELECT o.tipo_convenio, o.institucion, o.titulo, o.entidad_contraparte, o.observacion,
            o.anio_inicio, rb.fetched_at
     FROM offset_agreements o
     JOIN raw_mindef_batches rb ON rb.id = o.source_batch_id
     ${where}
     ORDER BY o.anio_inicio DESC NULLS LAST`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        tipoConvenio: r.tipo_convenio,
        institucion: r.institucion,
        titulo: r.titulo,
        entidadContraparte: r.entidad_contraparte,
        observacion: r.observacion,
        anioInicio: r.anio_inicio,
        fuente: { dataset: "MINDEF - Convenios Específicos de Compensaciones Industriales y Sociales Offset", extraidoEl: r.fetched_at },
      })),
    },
  };
}
