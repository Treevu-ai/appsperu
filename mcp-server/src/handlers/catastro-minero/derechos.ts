import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface DerechoRow extends NeonRow {
  codigou: string;
  fecha_denuncio: string | null;
  concesion: string;
  titular: string;
  hectareas: number | string | null;
  estado: string;
  estado_descripcion: string;
  sustancia: string;
  departamento: string;
  provincia: string;
  distrito: string;
  fecha_actualizacion: string | null;
}

function toApiShape(r: DerechoRow) {
  return {
    codigou: r.codigou,
    fechaDenuncio: r.fecha_denuncio,
    concesion: r.concesion,
    titular: r.titular,
    hectareas: r.hectareas,
    estado: r.estado,
    estadoDescripcion: r.estado_descripcion,
    sustancia: r.sustancia,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    fechaActualizacion: r.fecha_actualizacion,
  };
}

/**
 * Handler para `catastro_minero_derechos` — GET /api/derechos.
 * Origen: apps/catastro-minero/api/src/routes/derechos.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const estado = args.estado as string | undefined;
  const sustancia = args.sustancia as string | undefined;
  const concesion = args.concesion as string | undefined;
  const titular = args.titular as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

  if (departamento) conditions.push(`departamento = ${addParam(departamento)}`);
  if (provincia) conditions.push(`provincia = ${addParam(provincia)}`);
  if (distrito) conditions.push(`distrito = ${addParam(distrito)}`);
  if (estado) conditions.push(`estado = ${addParam(estado)}`);
  if (sustancia) conditions.push(`sustancia = ${addParam(sustancia)}`);
  if (concesion) addIlike("concesion", concesion);
  if (titular) addIlike("titular", titular);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM catastro_minero_derechos WHERE ${whereSql}`,
    params
  );
  const { rows } = await db.query<DerechoRow>(
    `SELECT codigou, fecha_denuncio, concesion, titular, hectareas, estado, estado_descripcion, sustancia, departamento, provincia, distrito, fecha_actualizacion
     FROM catastro_minero_derechos
     WHERE ${whereSql}
     ORDER BY codigou
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    listParams
  );

  const total = Number(countRows[0].total);

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: {
        dataset: "INGEMMET - Catastro Minero (capa 'Catastro Minero', derechos mineros)",
        nota: "Carácter referencial, solo de consulta (aviso de la propia fuente). `estado` es el código tal cual INGEMMET (ej. 'T'=Titulado) — ver `estadoDescripcion` para el texto legible.",
      },
    },
  };
}

/**
 * Handler para `catastro_minero_derecho_detalle` — GET /api/derechos/{codigou}.
 * Origen: apps/catastro-minero/api/src/routes/derechos.ts (segunda ruta).
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const codigou = args.codigou as string;

  const { rows } = await db.query<DerechoRow>(
    `SELECT codigou, fecha_denuncio, concesion, titular, hectareas, estado, estado_descripcion, sustancia, departamento, provincia, distrito, fecha_actualizacion
     FROM catastro_minero_derechos
     WHERE codigou = $1`,
    [codigou]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Derecho minero no encontrado." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
