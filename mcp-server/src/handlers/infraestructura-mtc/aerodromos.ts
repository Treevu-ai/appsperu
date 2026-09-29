import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 500;

interface AerodromoRow extends NeonRow {
  codigo_aerodromo: string;
  nombre: string;
  departamento: string;
  provincia: string;
  distrito: string;
  tipo_aerodromo: string;
  codigo_oaci: string | null;
  escala: string;
  estado: string;
  administrador: string;
  jerarquia: string;
  titularidad: string;
  es_concesionado: boolean | null;
  latitud: number | string | null;
  longitud: number | string | null;
  fecha_corte: string;
  fetched_at: string;
}

/**
 * Handler para `infraestructura_mtc_aerodromos` — GET /api/aerodromos.
 *
 * SQL idéntico a `apps/infraestructura-mtc/api/src/routes/aerodromos.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const idDepartamento = args.idDepartamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const tipoAerodromo = args.tipoAerodromo as string | undefined;
  const fechaCorte = args.fechaCorte as string | undefined;
  const historico = args.historico as string | undefined;
  const limit = args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (idDepartamento) {
    params.push(idDepartamento);
    conditions.push(`a.id_departamento = $${params.length}`);
  }
  if (provincia) {
    params.push(`%${provincia}%`);
    conditions.push(`a.provincia ILIKE $${params.length}`);
  }
  if (tipoAerodromo) {
    params.push(`%${tipoAerodromo}%`);
    conditions.push(`a.tipo_aerodromo ILIKE $${params.length}`);
  }
  if (fechaCorte) {
    params.push(fechaCorte);
    conditions.push(`a.fecha_corte = $${params.length}`);
  } else if (historico !== "true") {
    conditions.push(`a.fecha_corte = (SELECT MAX(fecha_corte) FROM aerodromos)`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM aerodromos a ${where}`,
    params,
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<AerodromoRow>(
    `SELECT a.codigo_aerodromo, a.nombre, a.departamento, a.provincia, a.distrito,
            a.tipo_aerodromo, a.codigo_oaci, a.escala, a.estado, a.administrador,
            a.jerarquia, a.titularidad, a.es_concesionado, a.latitud, a.longitud,
            a.fecha_corte, rb.fetched_at
     FROM aerodromos a
     JOIN raw_infraestructura_mtc_batches rb ON rb.id = a.source_batch_id
     ${where}
     ORDER BY a.fecha_corte DESC, a.codigo_aerodromo
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigoAerodromo: r.codigo_aerodromo,
        nombre: r.nombre,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipoAerodromo: r.tipo_aerodromo,
        codigoOaci: r.codigo_oaci,
        escala: r.escala,
        estado: r.estado,
        administrador: r.administrador,
        jerarquia: r.jerarquia,
        titularidad: r.titularidad,
        esConcesionado: r.es_concesionado,
        ubicacion: { latitud: r.latitud === null ? null : Number(r.latitud), longitud: r.longitud === null ? null : Number(r.longitud) },
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Infraestructura Aeroportuaria (Aeródromos)", extraidoEl: r.fetched_at },
      })),
    },
  };
}
