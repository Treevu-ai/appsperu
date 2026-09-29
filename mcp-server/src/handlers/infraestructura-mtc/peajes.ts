import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PeajeRow extends NeonRow {
  codigo_peaje: string;
  nombre: string;
  codigo_ruta: string;
  inicio_km: number | string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  localidad: string | null;
  es_concesionado: boolean | null;
  titular: string;
  ubicacion: string | null;
  estado: string;
  administrador: string;
  latitud: number | string | null;
  longitud: number | string | null;
  fecha_corte: string;
  fetched_at: string;
}

/**
 * Handler para `infraestructura_mtc_peajes` — GET /api/peajes.
 *
 * SQL idéntico a `apps/infraestructura-mtc/api/src/routes/peajes.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const idDepartamento = args.idDepartamento as string | undefined;
  const codigoRuta = args.codigoRuta as string | undefined;
  const estado = args.estado as string | undefined;
  const fechaCorte = args.fechaCorte as string | undefined;
  const historico = args.historico as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (idDepartamento) {
    params.push(idDepartamento);
    conditions.push(`p.id_departamento = $${params.length}`);
  }
  if (codigoRuta) {
    params.push(`%${codigoRuta}%`);
    conditions.push(`p.codigo_ruta ILIKE $${params.length}`);
  }
  if (estado) {
    params.push(`%${estado}%`);
    conditions.push(`p.estado ILIKE $${params.length}`);
  }
  if (fechaCorte) {
    params.push(fechaCorte);
    conditions.push(`p.fecha_corte = $${params.length}`);
  } else if (historico !== "true") {
    conditions.push(`p.fecha_corte = (SELECT MAX(fecha_corte) FROM peajes)`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<PeajeRow>(
    `SELECT p.codigo_peaje, p.nombre, p.codigo_ruta, p.inicio_km, p.departamento, p.provincia,
            p.distrito, p.localidad, p.es_concesionado, p.titular, p.ubicacion, p.estado,
            p.administrador, p.latitud, p.longitud, p.fecha_corte, rb.fetched_at
     FROM peajes p
     JOIN raw_infraestructura_mtc_batches rb ON rb.id = p.source_batch_id
     ${where}
     ORDER BY p.fecha_corte DESC, p.codigo_peaje
     LIMIT 500`,
    params,
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        codigoPeaje: r.codigo_peaje,
        nombre: r.nombre,
        codigoRuta: r.codigo_ruta,
        inicioKm: r.inicio_km === null ? null : Number(r.inicio_km),
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        localidad: r.localidad,
        esConcesionado: r.es_concesionado,
        titular: r.titular,
        ubicacion: {
          direccion: r.ubicacion,
          latitud: r.latitud === null ? null : Number(r.latitud),
          longitud: r.longitud === null ? null : Number(r.longitud),
        },
        estado: r.estado,
        administrador: r.administrador,
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Unidades de Peaje de la Red Vial Nacional", extraidoEl: r.fetched_at },
      })),
    },
  };
}
