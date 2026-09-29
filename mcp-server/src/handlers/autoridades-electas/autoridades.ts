import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface AutoridadRow extends NeonRow {
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  organizacion_politica: string;
  cargo: string;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  proceso_electoral: string;
  anio_eleccion: number;
  ambito: string | null;
  genero: string | null;
  edad: number | null;
  periodo: string | null;
  fetched_at: string;
}

/**
 * Handler para `autoridades_electas_autoridades` — GET /api/autoridades.
 * Origen: apps/autoridades-electas/api/src/routes/autoridades.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const nombre = args.nombre as string | undefined;
  const cargo = args.cargo as string | undefined;
  const organizacionPolitica = args.organizacionPolitica as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const anioEleccion = args.anioEleccion !== undefined ? Number(args.anioEleccion) : undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (nombre) {
    params.push(`%${nombre}%`);
    conditions.push(`(a.nombres || ' ' || a.apellido_paterno || ' ' || COALESCE(a.apellido_materno, '')) ILIKE $${params.length}`);
  }
  if (cargo) {
    params.push(`%${cargo}%`);
    conditions.push(`a.cargo ILIKE $${params.length}`);
  }
  if (organizacionPolitica) {
    params.push(`%${organizacionPolitica}%`);
    conditions.push(`a.organizacion_politica ILIKE $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`a.ubigeo = $${params.length}`);
  }
  if (anioEleccion) {
    params.push(anioEleccion);
    conditions.push(`a.anio_eleccion = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM autoridades_electas a ${where}`, params);
  const total = Number(countRows[0].total);

  const { rows } = await db.query<AutoridadRow>(
    `SELECT a.nombres, a.apellido_paterno, a.apellido_materno, a.organizacion_politica, a.cargo,
            a.region, a.provincia, a.distrito, a.ubigeo, a.fecha_inicio_vigencia, a.fecha_fin_vigencia,
            a.proceso_electoral, a.anio_eleccion, a.ambito, a.genero, a.edad, a.periodo, rb.fetched_at
     FROM autoridades_electas a
     JOIN raw_autoridades_electas_batches rb ON rb.id = a.source_batch_id
     ${where}
     ORDER BY a.anio_eleccion DESC, a.apellido_paterno
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
        nombreCompleto: [r.nombres, r.apellido_paterno, r.apellido_materno].filter(Boolean).join(" "),
        organizacionPolitica: r.organizacion_politica,
        cargo: r.cargo,
        region: r.region,
        provincia: r.provincia,
        distrito: r.distrito,
        ubigeo: r.ubigeo,
        fechaInicioVigencia: r.fecha_inicio_vigencia,
        fechaFinVigencia: r.fecha_fin_vigencia,
        procesoElectoral: r.proceso_electoral,
        anioEleccion: r.anio_eleccion,
        ambito: r.ambito,
        genero: r.genero,
        edad: r.edad,
        periodo: r.periodo,
        fuente: { dataset: "JNE - Autoridades Electas", extraidoEl: r.fetched_at },
      })),
    },
  };
}
