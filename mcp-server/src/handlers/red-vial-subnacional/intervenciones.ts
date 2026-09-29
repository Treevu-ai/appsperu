import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface IntervencionRow extends NeonRow {
  codigo_ruta: string;
  trayectoria: string | null;
  inicio_km: number | string | null;
  final_km: number | string | null;
  departamento: string;
  provincia: string;
  estado: string;
  superficie: string | null;
  longitud_km: number | string | null;
  responsable: string | null;
  corredor_vial: string | null;
  nivel_intervencion: string | null;
  tramo: number | string | null;
  fecha_corte: string | null;
  fetched_at: string;
}

/**
 * Handler para `red_vial_subnacional_intervenciones` — GET /api/intervenciones.
 * Origen: apps/red-vial-subnacional/api/src/routes/intervenciones.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const estado = args.estado as string | undefined;
  const codigoRuta = args.codigoRuta as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (departamento) addIlike("v.departamento", departamento);
  if (provincia) addIlike("v.provincia", provincia);
  if (estado) addIlike("v.estado", estado);
  if (codigoRuta) addIlike("v.codigo_ruta", codigoRuta);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM intervenciones_viales v ${where}`, params);
  const total = Number(countRows[0].total);

  const { rows } = await db.query<IntervencionRow>(
    `SELECT v.codigo_ruta, v.trayectoria, v.inicio_km, v.final_km, v.departamento, v.provincia,
            v.estado, v.superficie, v.longitud_km, v.responsable, v.corredor_vial,
            v.nivel_intervencion, v.tramo, v.fecha_corte, rb.fetched_at
     FROM intervenciones_viales v
     JOIN raw_pvd_batches rb ON rb.id = v.source_batch_id
     ${where}
     ORDER BY v.departamento, v.provincia, v.codigo_ruta
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
        codigoRuta: r.codigo_ruta,
        trayectoria: r.trayectoria,
        tramo: { inicioKm: r.inicio_km, finalKm: r.final_km },
        departamento: r.departamento,
        provincia: r.provincia,
        estado: r.estado,
        superficie: r.superficie,
        longitudKm: r.longitud_km === null ? null : Number(r.longitud_km),
        responsable: r.responsable,
        corredorVial: r.corredor_vial,
        nivelIntervencion: r.nivel_intervencion,
        tramoNumero: r.tramo,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC/Provías Descentralizado - Intervenciones en Redes Viales Subnacionales", extraidoEl: r.fetched_at },
      })),
    },
  };
}
