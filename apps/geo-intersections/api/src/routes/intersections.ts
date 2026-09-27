import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const intersectionsRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

// ─── Punto en polígono ────────────────────────────────────────────────────────

const PuntoQuerySchema = z.object({
  lat: z.coerce.number().min(-18).max(-0.5).describe("Latitud WGS84 (entre -18 y -0.5)"),
  lon: z.coerce.number().min(-81.5).max(-68.5).describe("Longitud WGS84 (entre -81.5 y -68.5)"),
  radio_km: z.coerce.number().min(0).max(50).optional().default(0)
    .describe("Radio en km para buscar dentro del punto (0 = punto exacto)"),
});

/**
 * Dado un punto (lat/lon), devuelve qué derechos mineros y títulos forestales
 * lo cubren directamente (radio=0) o lo contienen dentro del radio dado.
 *
 * PostGIS: ST_Contains para punto exacto, ST_DWithin para radio.
 */
intersectionsRouter.get(
  "/punto",
  asyncHandler(async (req, res) => {
    const p = parseQuery(PuntoQuerySchema, req.query, res);
    if (!p) return;

    const { lat, lon, radio_km = 0 } = p;
    const pointWKT = `SRID=4326;POINT(${lon} ${lat})`;

    if (radio_km === 0) {
      // Punto exacto — ST_Contains
      const [mining, forest] = await Promise.all([
        pool.query<{
          codigou: string; concesion: string; titular: string;
          estado: string; sustancia: string; departamento: string; hectareas: number;
        }>(
          `SELECT codigou, concesion, titular, estado, sustancia, departamento, hectareas
           FROM mining_rights
           WHERE ST_Contains(geometry, ST_GeomFromText($1, 4326))`,
          [pointWKT]
        ),
        pool.query<{
          capa: string; objectid: number; fuente: string; nom_dep: string;
          sup_sig: number; sup_apr: number;
        }>(
          `SELECT capa, objectid, fuente, nom_dep, sup_sig, sup_apr
           FROM forest_titles
           WHERE ST_Contains(geometry, ST_GeomFromText($1, 4326))`,
          [pointWKT]
        ),
      ]);

      res.json({
        punto: { lat, lon },
        tipo: "punto_exacto",
        derechos_mineros: mining.rows,
        titulos_forestales: forest.rows,
        fuente: {
          nota: "Punto coverage: ST_Contains. Para buscar en radio usar ?radio_km=N.",
        },
      });
    } else {
      // Buffer circular en grados (1° ≈ 111 km en Ecuador/Perú)
      const bufferDeg = radio_km / 111.0;
      const [mining, forest] = await Promise.all([
        pool.query<{
          codigou: string; concesion: string; titular: string;
          estado: string; sustancia: string; departamento: string;
          distancia_km: number;
        }>(
          `SELECT m.codigou, m.concesion, m.titular, m.estado, m.sustancia,
                  m.departamento,
                  ST_Distance(m.geometry::geography, ST_GeomFromText($1,4326)::geography) / 1000 AS distancia_km
           FROM mining_rights m, LATERAL (SELECT ST_GeomFromText($1, 4326) AS pt) AS p
           WHERE ST_DWithin(m.geometry, p.pt, $2)
           ORDER BY distancia_km`,
          [pointWKT, bufferDeg]
        ),
        pool.query<{
          capa: string; objectid: number; fuente: string; nom_dep: string;
          sup_sig: number; distancia_km: number;
        }>(
          `SELECT f.capa, f.objectid, f.fuente, f.nom_dep, f.sup_sig,
                  ST_Distance(f.geometry::geography, ST_GeomFromText($1,4326)::geography) / 1000 AS distancia_km
           FROM forest_titles f, LATERAL (SELECT ST_GeomFromText($1, 4326) AS pt) AS p
           WHERE ST_DWithin(f.geometry, p.pt, $2)
           ORDER BY distancia_km`,
          [pointWKT, bufferDeg]
        ),
      ]);

      res.json({
        punto: { lat, lon },
        radio_km,
        tipo: "buffer",
        derechos_mineros: mining.rows,
        titulos_forestales: forest.rows,
        fuente: { nota: `Buffer circular de ${bufferDeg}° ≈ ${radio_km} km` },
      });
    }
  })
);

// ─── Superposiciones de un derecho minero ──────────────────────────────────────

const MineroParamsSchema = z.object({ codigou: z.string().min(1) });

intersectionsRouter.get(
  "/minero/:codigou",
  asyncHandler(async (req, res) => {
    const params = MineroParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "codigou es obligatorio." });
      return;
    }
    const { codigou } = params.data;

    const { rows: derechos } = await pool.query(
      `SELECT codigou, concesion, titular, estado, sustancia,
              departamento, hectareas, area_km2
       FROM mining_rights WHERE codigou = $1`,
      [codigou]
    );

    if (derechos.length === 0) {
      res.status(404).json({ error: "Derecho minero no encontrado." });
      return;
    }

    const [{ rows: intersecciones }] = await Promise.all([
      pool.query(
        `SELECT i.*, m.concesion AS mining_concesion, m.titular AS mining_titular,
                f.capa AS forest_capa, f.fuente AS forest_fuente, f.nom_dep AS forest_nom_dep
         FROM intersection_results i
         JOIN mining_rights m ON m.codigou = i.mining_codigou
         JOIN forest_titles f ON f.capa = i.forest_capa AND f.objectid = i.forest_objectid
         WHERE i.mining_codigou = $1
         ORDER BY i.intersection_area_km2 DESC`,
        [codigou]
      ),
    ]);

    res.json({ derecho: derechos[0], intersecciones });
  })
);

// ─── Superposiciones de un título forestal ──────────────────────────────────────

const ForestalParamsSchema = z.object({
  capa: z.string().min(1),
  objectid: z.coerce.number().int().positive(),
});

intersectionsRouter.get(
  "/forestal/:capa/:objectid",
  asyncHandler(async (req, res) => {
    const params = ForestalParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "capa y objectid son obligatorios." });
      return;
    }
    const { capa, objectid } = params.data;

    const { rows: titulos } = await pool.query(
      `SELECT capa, objectid, fuente, nom_dep, sup_sig, sup_apr, area_km2
       FROM forest_titles WHERE capa = $1 AND objectid = $2`,
      [capa, objectid]
    );

    if (titulos.length === 0) {
      res.status(404).json({ error: "Título forestal no encontrado." });
      return;
    }

    const { rows: intersecciones } = await pool.query(
      `SELECT i.*, m.codigou AS mining_codigou, m.concesion AS mining_concesion,
              m.titular AS mining_titular, m.sustancia AS mining_sustancia,
              m.departamento AS mining_departamento
       FROM intersection_results i
       JOIN mining_rights m ON m.codigou = i.mining_codigou
       WHERE i.forest_capa = $1 AND i.forest_objectid = $2
       ORDER BY i.intersection_area_km2 DESC`,
      [capa, objectid]
    );

    res.json({ titulo: titulos[0], intersecciones });
  })
);

// ─── Reporte completo de intersecciones ────────────────────────────────────────

const ReportQuerySchema = z.object({
  departamento: z.string().min(1).optional()
    .describe("Departamento del derecho minero (ej. 'LA LIBERTAD')"),
  sustancia: z.string().min(1).optional()
    .describe("Código de sustancia del derecho minero"),
  capa: z.string().min(1).optional()
    .describe("Capa forestal (ej. 'modalidad_concesiones_forestales')"),
  min_area_km2: z.coerce.number().min(0).optional()
    .describe("Área mínima de intersección en km²"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

intersectionsRouter.get(
  "/report",
  asyncHandler(async (req, res) => {
    const p = parseQuery(ReportQuerySchema, req.query, res);
    if (!p) return;

    const { departamento, sustancia, capa, min_area_km2, limit = 200, offset = 0 } = p;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

    if (departamento) conditions.push(`i.mining_departamento = ${add(departamento)}`);
    if (sustancia) conditions.push(`m.sustancia = ${add(sustancia)}`);
    if (capa) conditions.push(`i.forest_capa = ${add(capa)}`);
    if (min_area_km2 !== undefined) conditions.push(`i.intersection_area_km2 >= ${add(min_area_km2)}`);

    const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
    const listParams = [...params];
    const lp = (v: unknown) => { listParams.push(v); return `$${listParams.length}`; };

    const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");

      const [{ rows: [{ total: totalStr }] }] = await Promise.all([
        client.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM intersection_results i
           JOIN mining_rights m ON m.codigou = i.mining_codigou
           WHERE ${whereSql}`,
          params
        ),
      ]);

      const { rows } = await client.query(
        `SELECT i.mining_codigou, i.mining_concesion, i.mining_titular,
                i.mining_estado, i.mining_sustancia, i.mining_departamento,
                i.mining_area_km2,
                i.forest_capa, i.forest_objectid, i.forest_fuente,
                i.forest_nom_dep, i.forest_area_km2,
                i.intersection_area_km2,
                i.mining_overlap_pct, i.forest_overlap_pct,
                i.computed_at
         FROM intersection_results i
         JOIN mining_rights m ON m.codigou = i.mining_codigou
         WHERE ${whereSql}
         ORDER BY i.intersection_area_km2 DESC
         LIMIT ${lp(limit)} OFFSET ${lp(offset)}`,
        listParams
      );

      await client.query("COMMIT");

      const total = Number(totalStr);
      res.json({
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
        resultados: rows,
        fuente: {
          dataset: "INGEMMET ∩ SERFOR — superposiciones mineras y forestales",
          nota: "Solo incluye derechos mineros y títulos forestales que tienen geometría en la base. El reporte se regenera con npm run ingest:intersections.",
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── Stats resumen ─────────────────────────────────────────────────────────────

intersectionsRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [
      rightsCount,
      titlesCount,
      intersectionsCount,
      byDepartamento,
      bySustancia,
      byCapa,
      lastBatch,
    ] = await Promise.all([
      pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM mining_rights"),
      pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM forest_titles"),
      pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM intersection_results"),
      pool.query<{ departamento: string; count: string }>(
        `SELECT mining_departamento AS departamento, COUNT(*) AS count
         FROM intersection_results GROUP BY 1 ORDER BY count DESC LIMIT 10`
      ),
      pool.query<{ sustancia: string; count: string }>(
        `SELECT m.sustancia, COUNT(*) AS count
         FROM intersection_results i
         JOIN mining_rights m ON m.codigou = i.mining_codigou
         GROUP BY 1 ORDER BY count DESC LIMIT 10`
      ),
      pool.query<{ capa: string; count: string }>(
        `SELECT forest_capa AS capa, COUNT(*) AS count
         FROM intersection_results GROUP BY 1 ORDER BY count DESC`
      ),
      pool.query<{ computed_at: Date }>(
        `SELECT computed_at FROM intersection_results
         ORDER BY computed_at DESC LIMIT 1`
      ),
    ]);

    res.json({
      resumen: {
        derechos_mineros_con_geometria: Number(rightsCount.rows[0].count),
        titulos_forestales_con_geometria: Number(titlesCount.rows[0].count),
        total_intersecciones: Number(intersectionsCount.rows[0].count),
      },
      por_departamento: byDepartamento.rows.map((r) => ({
        departamento: r.departamento,
        intersecciones: Number(r.count),
      })),
      por_sustancia: bySustancia.rows.map((r) => ({
        sustancia: r.sustancia,
        intersecciones: Number(r.count),
      })),
      por_capa_forestal: byCapa.rows.map((r) => ({
        capa: r.capa,
        intersecciones: Number(r.count),
      })),
      ultima_interseccion: lastBatch.rows[0]?.computed_at ?? null,
    });
  })
);
