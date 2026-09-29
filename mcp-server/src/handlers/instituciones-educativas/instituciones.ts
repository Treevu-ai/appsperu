import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface InstitucionRow extends NeonRow {
  cod_mod: string;
  anexo: string;
  nombre: string;
  nivel_modalidad: string;
  gestion: string;
  direccion: string | null;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  ugel: string | null;
  latitud: number | string | null;
  longitud: number | string | null;
  turno: string | null;
  ruc: string | null;
  razon_social: string | null;
  estado: string;
  area_censo: string | null;
  fecha_actualizacion: string | null;
  fetched_at: string;
}

/**
 * Handler para `instituciones_educativas_instituciones` — GET /api/instituciones.
 * SQL idéntico a `apps/instituciones-educativas/api/src/routes/instituciones.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const estado = args.estado as string | undefined;
  const gestion = args.gestion as string | undefined;
  const nombre = args.nombre as string | undefined;
  const areaCenso = args.areaCenso as string | undefined;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (departamento) addIlike("i.departamento", departamento);
  if (provincia) addIlike("i.provincia", provincia);
  if (distrito) addIlike("i.distrito", distrito);
  if (gestion) addIlike("i.gestion", gestion);
  if (nombre) addIlike("i.nombre", nombre);
  if (estado) {
    params.push(estado);
    conditions.push(`i.estado = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`i.ubigeo = $${params.length}`);
  }
  if (areaCenso) {
    params.push(areaCenso);
    conditions.push(`i.area_censo = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM instituciones_educativas i ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<InstitucionRow>(
    `SELECT i.cod_mod, i.anexo, i.nombre, i.nivel_modalidad, i.gestion, i.direccion,
            i.ubigeo, i.departamento, i.provincia, i.distrito, i.ugel, i.latitud, i.longitud,
            i.turno, i.ruc, i.razon_social, i.estado, i.area_censo, i.fecha_actualizacion, rb.fetched_at
     FROM instituciones_educativas i
     JOIN raw_padron_batches rb ON rb.id = i.source_batch_id
     ${where}
     ORDER BY i.departamento, i.provincia, i.distrito, i.nombre
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
        codModular: r.cod_mod,
        anexo: r.anexo,
        nombre: r.nombre,
        nivelModalidad: r.nivel_modalidad,
        gestion: r.gestion,
        direccion: r.direccion,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        ugel: r.ugel,
        coordenadas: r.latitud !== null && r.longitud !== null ? { lat: Number(r.latitud), lon: Number(r.longitud) } : null,
        turno: r.turno,
        ruc: r.ruc,
        razonSocial: r.razon_social,
        estado: r.estado,
        areaCenso: r.area_censo,
        fechaActualizacion: r.fecha_actualizacion,
        fuente: { dataset: "MINEDU/ESCALE - Padrón de Instituciones Educativas", extraidoEl: r.fetched_at },
      })),
    },
  };
}
