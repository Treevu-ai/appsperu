import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

interface TerminalRow extends NeonRow {
  codigo_puerto: string;
  nombre_terminal: string;
  ambito: string;
  tipo_terminal: string;
  alcance: string;
  uso: string;
  trafico: string;
  actividad: string;
  estado: string;
  estado_conservacion: string;
  titularidad: string;
  administrador: string;
  es_concesionado: boolean | null;
  latitud: number | string | null;
  longitud: number | string | null;
  fecha_corte: string;
  fetched_at: string;
}

/**
 * Handler para `infraestructura_mtc_terminales_portuarios` — GET /api/terminales-portuarios.
 *
 * SQL idéntico a `apps/infraestructura-mtc/api/src/routes/terminales-portuarios.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const idDepartamento = args.idDepartamento as string | undefined;
  const ambito = args.ambito as string | undefined;
  const estado = args.estado as string | undefined;
  const fechaCorte = args.fechaCorte as string | undefined;
  const historico = args.historico as string | undefined;
  const limit = args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT;
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (idDepartamento) {
    params.push(idDepartamento);
    conditions.push(`t.id_departamento = $${params.length}`);
  }
  if (ambito) {
    params.push(`%${ambito}%`);
    conditions.push(`t.ambito ILIKE $${params.length}`);
  }
  if (estado) {
    params.push(`%${estado}%`);
    conditions.push(`t.estado ILIKE $${params.length}`);
  }
  if (fechaCorte) {
    params.push(fechaCorte);
    conditions.push(`t.fecha_corte = $${params.length}`);
  } else if (historico !== "true") {
    conditions.push(`t.fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM terminales_portuarios t ${where}`,
    params,
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<TerminalRow>(
    `SELECT t.codigo_puerto, t.nombre_terminal, t.ambito, t.tipo_terminal, t.alcance, t.uso,
            t.trafico, t.actividad, t.estado, t.estado_conservacion, t.titularidad,
            t.administrador, t.es_concesionado, t.latitud, t.longitud, t.fecha_corte,
            rb.fetched_at
     FROM terminales_portuarios t
     JOIN raw_infraestructura_mtc_batches rb ON rb.id = t.source_batch_id
     ${where}
     ORDER BY t.fecha_corte DESC, t.codigo_puerto
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
        codigoPuerto: r.codigo_puerto,
        nombreTerminal: r.nombre_terminal,
        ambito: r.ambito,
        tipoTerminal: r.tipo_terminal,
        alcance: r.alcance,
        uso: r.uso,
        trafico: r.trafico,
        actividad: r.actividad,
        estado: r.estado,
        estadoConservacion: r.estado_conservacion,
        titularidad: r.titularidad,
        administrador: r.administrador,
        esConcesionado: r.es_concesionado,
        ubicacion: { latitud: r.latitud === null ? null : Number(r.latitud), longitud: r.longitud === null ? null : Number(r.longitud) },
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MTC - Infraestructura Portuaria (Terminales Portuarios y Embarcaderos)", extraidoEl: r.fetched_at },
      })),
    },
  };
}
