import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const comunidadesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const CAPAS_COMUNIDADES = ["comunidades_campesinas", "comunidades_nativas"] as const;

const SELECT_COLUMNS = `
  capa, objectid, area_ha, perimetro, id_dist, cod_proy,
  nom_dpto, nom_prov, nom_dist, nombre, estado, fuente,
  tipo_proceso, nro_titulo, anio_titulo,
  geometry, area_km2, geometry_valid, atributos_extra
`;

function toApiShape(r: Record<string, unknown>) {
  return {
    capa: r.capa,
    objectid: r.objectid,
    areaHa: r.area_ha,
    perimetro: r.perimetro,
    idDist: r.id_dist,
    codProy: r.cod_proy,
    nomDpto: r.nom_dpto,
    nomProv: r.nom_prov,
    nomDist: r.nom_dist,
    nombre: r.nombre,
    estado: r.estado,
    fuente: r.fuente,
    tipoProceso: r.tipo_proceso,
    nroTitulo: r.nro_titulo,
    anioTitulo: r.anio_titulo,
    geometry: r.geometry,
    areaKm2: r.area_km2,
    geometryValid: r.geometry_valid,
    atributosExtra: r.atributos_extra,
  };
}

const ComunidadesQuerySchema = z.object({
  capa: z.enum(CAPAS_COMUNIDADES).optional(),
  nomDpto: z.string().min(1).optional().describe("Departamento (texto o código UBIGEO)."),
  nomProv: z.string().min(1).optional().describe("Provincia (texto o código UBIGEO)."),
  nomDist: z.string().min(1).optional().describe("Distrito (texto o código UBIGEO)."),
  estado: z.string().min(1).optional().describe("Estado de titulación (ej. 'TITULADAS', 'PREDIO ADJUDICADO')."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

comunidadesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ComunidadesQuerySchema, req.query, res);
    if (!parsed) return;
    const { capa, nomDpto, nomProv, nomDist, estado, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (capa) conditions.push(`capa = ${addParam(capa)}`);
    if (nomDpto) conditions.push(`nom_dpto = ${addParam(nomDpto)}`);
    if (nomProv) conditions.push(`nom_prov = ${addParam(nomProv)}`);
    if (nomDist) conditions.push(`nom_dist = ${addParam(nomDist)}`);
    if (estado) conditions.push(`estado = ${addParam(estado)}`);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const limitPlaceholder = `$${listParams.push(limit)}`;
    const offsetPlaceholder = `$${listParams.push(offset)}`;

    const client = await pool.connect();
    let countRows: { total: string }[];
    let rows: Record<string, unknown>[];
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      ({ rows: countRows } = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM catastro_rural WHERE ${whereSql}`,
        params
      ));
      ({ rows } = await client.query(
        `SELECT ${SELECT_COLUMNS} FROM catastro_rural
         WHERE ${whereSql}
         ORDER BY capa, objectid
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const total = Number(countRows[0].total);

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: {
        dataset: "MIDAGRI/UEGPS - PTRT3 Catastro Rural (Comunidades Campesinas + Comunidades Nativas)",
        nota: "Capa de titulación del PTRT3. Comunidades Campesinas (capa 5) traen 'estado'. Comunidades Nativas (capa 6) traen 'estado' + 'nro_titulo'/'anio_titulo'/'area_titulo'. objectid NO es una clave única global. Cada capa es un snapshot completo reemplazado en cada ingesta. Las geometrías vienen como GeoJSON (Polygon/MultiPolygon, WGS84).",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  capa: z.enum(CAPAS_COMUNIDADES),
  objectid: z.coerce.number().int(),
});

comunidadesRouter.get(
  "/:capa/:objectid",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "capa debe ser 'comunidades_campesinas' o 'comunidades_nativas', objectid debe ser entero." });
      return;
    }
    const { capa, objectid } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM catastro_rural WHERE capa = $1 AND objectid = $2`,
      [capa, objectid]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Comunidad no encontrada." });
      return;
    }

    res.json(toApiShape(rows[0]));
  })
);