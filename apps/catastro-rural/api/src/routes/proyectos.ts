import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const proyectosRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const CAPA_PROYECTOS = "proyectos_catastrales" as const;

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

const ProyectosQuerySchema = z.object({
  nomDpto: z.string().min(1).optional().describe("Departamento (texto o código UBIGEO / id_dpto)."),
  codProy: z.string().min(1).optional().describe("Código del proyecto catastral."),
  nombre: z.string().min(1).optional().describe("Búsqueda parcial por nombre del proyecto (ILIKE)."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

proyectosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProyectosQuerySchema, req.query, res);
    if (!parsed) return;
    const { nomDpto, codProy, nombre, limit, offset } = parsed;

    const conditions: string[] = [`capa = 'proyectos_catastrales'`];
    const params: unknown[] = [];
    const addParam = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

    if (nomDpto) conditions.push(`nom_dpto = ${addParam(nomDpto)}`);
    if (codProy) conditions.push(`cod_proy = ${addParam(codProy)}`);
    if (nombre) addIlike("nombre", nombre);

    const whereSql = conditions.join(" AND ");
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
         ORDER BY objectid
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
        dataset: "MIDAGRI/UEGPS - PTRT3 Catastro Rural (Proyectos Catastrales - capa 8)",
        nota: "440 proyectos catastrales. Campos clave: cod_proy, nombre_proy (en atributos_extra), id_dpto (en nom_dpto). objectid NO es una clave única global. Cada ingesta es un snapshot completo reemplazado. Las geometrías vienen como GeoJSON (Polygon/MultiPolygon, WGS84).",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  objectid: z.coerce.number().int(),
});

proyectosRouter.get(
  "/:objectid",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "objectid debe ser entero." });
      return;
    }
    const { objectid } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM catastro_rural WHERE capa = 'proyectos_catastrales' AND objectid = $1`,
      [objectid]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Proyecto catastral no encontrado." });
      return;
    }

    res.json(toApiShape(rows[0]));
  })
);