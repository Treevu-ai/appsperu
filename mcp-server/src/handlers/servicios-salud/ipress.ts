import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface IpressRow extends NeonRow {
  cod_ipress: string;
  institucion: string;
  nombre: string;
  clasificacion: string;
  tipo_establecimiento: string;
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  direccion: string;
  categoria: string;
  estado: string;
  norte: number | string | null;
  este: number | string | null;
  updated_at: string;
}

/**
 * Handler para `servicios_salud_ipress` — GET /api/ipress.
 * Origen: apps/servicios-salud/api/src/routes/ipress.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string | undefined;
  const departamento = args.departamento as string | undefined;
  const distrito = args.distrito as string | undefined;
  const estado = args.estado as string | undefined;
  const limit = args.limit ? Number(args.limit) : 2000;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`ubigeo = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`distrito = $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`estado = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM ipress ${where}`, params);
  const total = Number(countRows[0].total);

  const { rows } = await db.query<IpressRow>(
    `SELECT cod_ipress, institucion, nombre, clasificacion, tipo_establecimiento,
            departamento, provincia, distrito, ubigeo, direccion, categoria, estado,
            norte, este, updated_at
     FROM ipress
     ${where}
     ORDER BY departamento, provincia, distrito, nombre
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      cobertura: "RENIPRESS es un registro nacional (SUSALUD); no está acotado a La Libertad.",
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codIpress: r.cod_ipress,
        institucion: r.institucion,
        nombre: r.nombre,
        clasificacion: r.clasificacion,
        tipoEstablecimiento: r.tipo_establecimiento,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        ubigeo: r.ubigeo,
        direccion: r.direccion,
        categoria: r.categoria,
        estado: r.estado,
        norte: r.norte === null ? null : Number(r.norte),
        este: r.este === null ? null : Number(r.este),
        actualizadoEl: r.updated_at,
      })),
    },
  };
}
