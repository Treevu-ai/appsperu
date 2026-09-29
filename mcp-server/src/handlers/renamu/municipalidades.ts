import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface MunicipalidadRow extends NeonRow {
  id: number;
  anio: number;
  idmunici: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  tipomuni: string;
  fetched_at: string;
}

const TIPOMUNI_LABELS: Record<string, string> = { "1": "Provincial", "2": "Distrital", "3": "Centro Poblado" };

/**
 * Handler para `renamu_municipalidades` — GET /api/municipalidades.
 * SQL idéntico a `apps/renamu/api/src/routes/municipalidades.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const departamento = args.departamento as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const historico = args.historico as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`m.anio = $${params.length}`);
  } else if (historico !== "true") {
    conditions.push(`m.anio = (SELECT MAX(anio) FROM renamu_municipalidades)`);
  }
  if (departamento) {
    params.push(`%${departamento}%`);
    conditions.push(`m.departamento ILIKE $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`m.ubigeo = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<MunicipalidadRow>(
    `SELECT m.id, m.anio, m.idmunici, m.ubigeo, m.departamento, m.provincia, m.distrito, m.tipomuni, rb.fetched_at
     FROM renamu_municipalidades m
     JOIN raw_renamu_batches rb ON rb.id = m.source_batch_id
     ${where}
     ORDER BY m.anio DESC, m.ubigeo`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        idmunici: r.idmunici,
        anio: r.anio,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipomuni: TIPOMUNI_LABELS[r.tipomuni as string] ?? r.tipomuni,
        fuente: { dataset: "INEI - RENAMU", extraidoEl: r.fetched_at },
      })),
    },
  };
}
