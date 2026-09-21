import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const areasRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const CAPAS = [
  "anp_nacional_definitiva",
  "zona_reservada",
  "area_conservacion_regional",
  "area_conservacion_privada",
  "sitios_prioritarios",
] as const;

const AreasQuerySchema = z.object({
  capa: z.enum(CAPAS).optional(),
  nombre: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  ubicacion: z.string().min(1).optional().describe("Búsqueda parcial (ILIKE)."),
  categoria: z.string().min(1).optional().describe("Solo aplica a la capa anp_nacional_definitiva."),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Listado de áreas protegidas. Cada capa es un snapshot completo reemplazado en cada ingesta
 * (ver migración 001_init.sql) -- no hace falta filtrar por "batch más reciente", todas las
 * filas presentes ya son las vigentes.
 */
areasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(AreasQuerySchema, req.query, res);
    if (!parsed) return;
    const { capa, nombre, ubicacion, categoria, limit, offset } = parsed;

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

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM sernanp_areas WHERE ${whereSql}`, params),
      pool.query(
        `SELECT capa, objectid, codigo, nombre, categoria, ubicacion, superficie_ha, base_legal_establecimiento, fecha_establecimiento, base_legal_modificacion, fecha_modificacion, observaciones, atributos_extra
         FROM sernanp_areas
         WHERE ${whereSql}
         ORDER BY capa, objectid
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        listParams
      ),
    ]);

    const total = Number(countRows[0].total);

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
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
      })),
      fuente: {
        dataset: "SERNANP - Geoservicios (Áreas Naturales Protegidas y afines)",
        nota: "El código de área (anp_codi/zr_codi/acr_codi/acp_codi/sp_cod) NO es una clave única — un área con geometría multi-parte puede aparecer en varias filas con el mismo código. Cada capa es un snapshot completo reemplazado en cada ingesta.",
      },
    });
  })
);

const DetailParamsSchema = z.object({
  capa: z.enum(CAPAS),
  objectid: z.coerce.number().int(),
});

areasRouter.get(
  "/:capa/:objectid",
  asyncHandler(async (req, res) => {
    const parsedParams = DetailParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "capa debe ser una de las 5 capas soportadas, objectid debe ser entero." });
      return;
    }
    const { capa, objectid } = parsedParams.data;

    const { rows } = await pool.query(
      `SELECT capa, objectid, codigo, nombre, categoria, ubicacion, superficie_ha, base_legal_establecimiento, fecha_establecimiento, base_legal_modificacion, fecha_modificacion, observaciones, atributos_extra
       FROM sernanp_areas
       WHERE capa = $1 AND objectid = $2`,
      [capa, objectid]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Área no encontrada." });
      return;
    }

    const r = rows[0];
    res.json({
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
    });
  })
);
