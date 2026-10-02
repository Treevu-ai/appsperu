import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ReclamoRow extends NeonRow {
  anio: number;
  mes: number;
  entidad_prestadora: string;
  concesion: string | null;
  siglas_concesion: string | null;
  medio_presentacion: string | null;
  motivo_reclamo: string | null;
  materia_reclamo: string | null;
  estado_reclamo: string | null;
  cantidad_reclamos: number;
}

/**
 * Handler para `ositran_reclamos_reclamos` — reclamos sobre carreteras
 * concesionadas. Origen: apps/ositran-reclamos/api/src/ingest/ositran-connector.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio ? Number(args.anio) : undefined;
  const mes = args.mes ? Number(args.mes) : undefined;
  const entidadPrestadora = args.entidadPrestadora as string | undefined;
  const siglasConcesion = args.siglasConcesion as string | undefined;
  const estadoReclamo = args.estadoReclamo as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addEq = (column: string, value: unknown) => {
    params.push(value);
    conditions.push(`${column} = $${params.length}`);
  };
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (anio !== undefined) addEq("anio", anio);
  if (mes !== undefined) addEq("mes", mes);
  if (entidadPrestadora) addIlike("entidad_prestadora", entidadPrestadora);
  if (siglasConcesion) addEq("siglas_concesion", siglasConcesion);
  if (estadoReclamo) addIlike("estado_reclamo", estadoReclamo);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM reclamos_carreteras ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<ReclamoRow>(
    `SELECT anio, mes, entidad_prestadora, concesion, siglas_concesion, medio_presentacion,
            motivo_reclamo, materia_reclamo, estado_reclamo, cantidad_reclamos
     FROM reclamos_carreteras
     ${where}
     ORDER BY anio DESC, mes DESC, entidad_prestadora
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
        anio: r.anio,
        mes: r.mes,
        entidadPrestadora: r.entidad_prestadora,
        concesion: r.concesion,
        siglasConcesion: r.siglas_concesion,
        medioPresentacion: r.medio_presentacion,
        motivoReclamo: r.motivo_reclamo,
        materiaReclamo: r.materia_reclamo,
        estadoReclamo: r.estado_reclamo,
        cantidadReclamos: r.cantidad_reclamos,
      })),
      fuente: { dataset: "OSITRAN - Reclamos sobre Carreteras Concesionadas" },
    },
  };
}
