import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface LicenciamientoRow extends NeonRow {
  codigo_entidad: string | null;
  nombre: string;
  tipo_gestion: string | null;
  estado_licenciamiento: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  periodo_licenciamiento: number | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  fecha_corte: string | null;
}

/**
 * Handler para `sunedu_licenciamiento_licenciamiento` — GET /api/licenciamiento.
 * Origen: apps/sunedu-licenciamiento/api/src/routes/licenciamiento.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const nombre = args.nombre as string | undefined;
  const estadoLicenciamiento = args.estadoLicenciamiento as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const tipoGestion = args.tipoGestion as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (nombre) addIlike("nombre", nombre);
  if (estadoLicenciamiento) addIlike("estado_licenciamiento", estadoLicenciamiento);
  if (departamento) addIlike("departamento", departamento);
  if (provincia) addIlike("provincia", provincia);
  if (tipoGestion) addIlike("tipo_gestion", tipoGestion);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM licenciamiento_universidades ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<LicenciamientoRow>(
    `SELECT codigo_entidad, nombre, tipo_gestion, estado_licenciamiento, fecha_inicio, fecha_fin,
            periodo_licenciamiento, departamento, provincia, distrito, ubigeo, latitud, longitud, fecha_corte
     FROM licenciamiento_universidades
     ${where}
     ORDER BY departamento, nombre, id
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
        codigoEntidad: r.codigo_entidad,
        nombre: r.nombre,
        tipoGestion: r.tipo_gestion,
        estadoLicenciamiento: r.estado_licenciamiento,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
        periodoLicenciamiento: r.periodo_licenciamiento,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        ubigeo: r.ubigeo,
        latitud: r.latitud === null ? null : Number(r.latitud),
        longitud: r.longitud === null ? null : Number(r.longitud),
        fechaCorte: r.fecha_corte,
      })),
      fuente: { dataset: "SUNEDU - Licenciamiento Institucional" },
    },
  };
}
