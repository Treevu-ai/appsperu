import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const CAPAS = [
  "anp_nacional_definitiva",
  "zona_reservada",
  "area_conservacion_regional",
  "area_conservacion_privada",
  "sitios_prioritarios",
] as const;

interface AreaRow extends NeonRow {
  capa: string;
  objectid: number;
  codigo: string | null;
  nombre: string | null;
  categoria: string | null;
  ubicacion: string | null;
  superficie_ha: number | string | null;
  base_legal_establecimiento: string | null;
  fecha_establecimiento: string | null;
  base_legal_modificacion: string | null;
  fecha_modificacion: string | null;
  observaciones: string | null;
  atributos_extra: unknown;
}

function toApiShape(r: AreaRow) {
  return {
    capa: r.capa,
    objectid: r.objectid,
    codigo: r.codigo,
    nombre: r.nombre,
    categoria: r.categoria,
    ubicacion: r.ubicacion,
    superficieHa: r.superficie_ha,
    baseLegalEstablecimiento: r.base_legal_establecimiento,
    fechaEstablecimiento: r.fecha_establecimiento,
    baseLegalModificacion: r.base_legal_modificacion,
    fechaModificacion: r.fecha_modificacion,
    observaciones: r.observaciones,
    atributosExtra: r.atributos_extra,
  };
}

/**
 * Handler para `areas_protegidas_areas` — GET /api/areas.
 * Origen: apps/areas-protegidas/api/src/routes/areas.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as (typeof CAPAS)[number] | undefined;
  const nombre = args.nombre as string | undefined;
  const ubicacion = args.ubicacion as string | undefined;
  const categoria = args.categoria as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

  if (capa) conditions.push(`capa = ${addParam(capa)}`);
  if (nombre) addIlike("nombre", nombre);
  if (ubicacion) addIlike("ubicacion", ubicacion);
  if (categoria) conditions.push(`categoria = ${addParam(categoria)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM sernanp_areas WHERE ${whereSql}`, params);
  const { rows } = await db.query<AreaRow>(
    `SELECT capa, objectid, codigo, nombre, categoria, ubicacion, superficie_ha, base_legal_establecimiento, fecha_establecimiento, base_legal_modificacion, fecha_modificacion, observaciones, atributos_extra
     FROM sernanp_areas
     WHERE ${whereSql}
     ORDER BY capa, objectid
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
        dataset: "SERNANP - Geoservicios (Áreas Naturales Protegidas y afines)",
        nota: "El código de área (anp_codi/zr_codi/acr_codi/acp_codi/sp_cod) NO es una clave única — un área con geometría multi-parte puede aparecer en varias filas con el mismo código. Cada capa es un snapshot completo reemplazado en cada ingesta.",
      },
    },
  };
}

/**
 * Handler para `areas_protegidas_area_detalle` — GET /api/areas/{capa}/{objectid}.
 * Origen: apps/areas-protegidas/api/src/routes/areas.ts (segunda ruta).
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string;
  const objectid = Number(args.objectid);

  const { rows } = await db.query<AreaRow>(
    `SELECT capa, objectid, codigo, nombre, categoria, ubicacion, superficie_ha, base_legal_establecimiento, fecha_establecimiento, base_legal_modificacion, fecha_modificacion, observaciones, atributos_extra
     FROM sernanp_areas
     WHERE capa = $1 AND objectid = $2`,
    [capa, objectid]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Área no encontrada." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
