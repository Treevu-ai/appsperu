import { Router } from "express";
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Polygon, MultiPolygon } from "geojson";
import { pool } from "../db/pool.js";
import { geoIntersectionsPool } from "../db/geo-intersections-pool.js";
import { codigoDeDepartamento } from "../lib/ubigeo.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { RiesgoEUDRQuerySchema, type RiesgoEUDRQuery, type RiesgoEUDRData } from "../schema/riesgo-eudr.js";

export const riesgoEUDRRouter = Router();

/**
 * Se lanza cuando la consulta no pudo ejecutarse. La razón para que sea un
 * error y no `[]` es que un `catch` que devuelve `[]` convierte "no pude
 * preguntar" en "no encontré riesgo forestal" — la conclusión opuesta. Para
 * un agente que consulta esto para decidir si un titular cumple EUDR, esa
 * diferencia separa "puede proceder" de "tiene que descartar el caso".
 */
export const RIESGO_EUDR_NO_DISPONIBLE = "RIESGO_EUDR_NO_DISPONIBLE";

export class RiesgoEUDRNoDisponibleError extends Error {
  readonly code = RIESGO_EUDR_NO_DISPONIBLE;

  constructor(cause: unknown) {
    super(
      "No se pudo consultar la fuente de riesgo EUDR. La consulta falló o la " +
        "capa de deforestación no está disponible; esto NO significa que no exista riesgo."
    );
    this.cause = cause;
  }
}

interface ForestTitleRow {
  id: number;
  doc_leg: string | null;
  sup_sig: number | string | null;
  sector: string | null;
  geojson: string;
}

interface AlertaRow {
  longitud: number;
  latitud: number;
}

type ForestGeometry = Polygon | MultiPolygon;

/**
 * Umbrales de conteo de alertas MINAM dentro del polígono del título —
 * heurística propia de este conector, no una clasificación oficial de MINAM
 * ni de la UE. El dato real y verificable es `alertasDentroDelTitulo`; el
 * nivel es solo una lectura rápida de ese número.
 */
function clasificarRiesgo(conteoAlertas: number): "ALTO" | "MEDIO" | "BAJO" {
  if (conteoAlertas >= 10) return "ALTO";
  if (conteoAlertas >= 1) return "MEDIO";
  return "BAJO";
}

export async function getRiesgoEUDR(query: RiesgoEUDRQuery): Promise<RiesgoEUDRData[]> {
  const { departamento } = query;

  try {
    const codigo = departamento ? codigoDeDepartamento(departamento) : null;
    if (departamento && !codigo) {
      // Nombre de departamento no reconocido — ninguna fila, no un error.
      return [];
    }

    const { rows: titulos } = await geoIntersectionsPool.query<ForestTitleRow>(
      `SELECT id, doc_leg, sup_sig, atributos_extra->>'SECTOR' as sector,
              ST_AsGeoJSON(geometry) as geojson
       FROM forest_titles
       ${codigo ? "WHERE nom_dep = $1" : ""}
       LIMIT 500`,
      codigo ? [codigo] : []
    );

    if (titulos.length === 0) return [];

    const geometrias: Array<{ titulo: ForestTitleRow; feature: ForestGeometry }> = titulos
      .map((t) => {
        try {
          return { titulo: t, feature: JSON.parse(t.geojson) as ForestGeometry };
        } catch {
          return null;
        }
      })
      .filter((g): g is { titulo: ForestTitleRow; feature: ForestGeometry } => g !== null);

    if (geometrias.length === 0) return [];

    // Bounding box conjunto de todos los polígonos en este lote — acota la
    // consulta de alertas a la zona relevante en vez de escanear las 183k
    // alertas nacionales contra cada polígono.
    const [minLon, minLat, maxLon, maxLat] = bbox({
      type: "GeometryCollection",
      geometries: geometrias.map((g) => g.feature),
    });

    const { rows: alertas } = await pool.query<AlertaRow>(
      `SELECT longitud, latitud FROM minam_alertas_deforestacion
       WHERE longitud BETWEEN $1 AND $2 AND latitud BETWEEN $3 AND $4`,
      [minLon, maxLon, minLat, maxLat]
    );

    return geometrias.map(({ titulo, feature }) => {
      const conteoAlertas = alertas.reduce(
        (acc, a) => acc + (booleanPointInPolygon(point([a.longitud, a.latitud]), feature) ? 1 : 0),
        0
      );
      return {
        tituloForestalId: String(titulo.id),
        sector: titulo.sector?.trim() || null,
        docLegal: titulo.doc_leg,
        superficieHa: titulo.sup_sig === null ? null : Number(titulo.sup_sig),
        estadoRiesgo: clasificarRiesgo(conteoAlertas),
        alertasDentroDelTitulo: conteoAlertas,
        evidencia:
          "Conteo de alertas MINAM (Tem_AlertasTempranasDeforestacion) con intersección punto-en-polígono " +
          "real contra la geometría del título en geo-intersections.forest_titles.",
      };
    });
  } catch (e) {
    if (e instanceof RiesgoEUDRNoDisponibleError) throw e;
    throw new RiesgoEUDRNoDisponibleError(e);
  }
}

riesgoEUDRRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(RiesgoEUDRQuerySchema, req.query, res);
  if (!query) return;

  try {
    const results = await getRiesgoEUDR(query);
    res.json(results);
  } catch (e) {
    // 503 y no 200 con `[]`: un 200 vacío es indistinguible de "no hay riesgo
    // en ese título", que es justo la conclusión que este cruce no puede
    // soportar todavía.
    if (e instanceof RiesgoEUDRNoDisponibleError) {
      res.status(503).json({ error: e.code, detalle: e.message });
      return;
    }
    throw e;
  }
}));
