import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Polygon, MultiPolygon } from "geojson";
import type { NeonRow } from "../../db/neon-pool.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import { codigoDeDepartamento } from "./_helpers.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ForestTitleRow extends NeonRow {
  id: number;
  doc_leg: string | null;
  sup_sig: number | string | null;
  sector: string | null;
  geojson: string;
}

interface AlertaRow extends NeonRow {
  longitud: number;
  latitud: number;
}

type ForestGeometry = Polygon | MultiPolygon;

function clasificarRiesgo(conteoAlertas: number): "ALTO" | "MEDIO" | "BAJO" {
  if (conteoAlertas >= 10) return "ALTO";
  if (conteoAlertas >= 1) return "MEDIO";
  return "BAJO";
}

/**
 * Handler para `territorio_inteligencia_riesgo_eudr` — GET /api/riesgo-eudr.
 * Origen: apps/territorio-inteligencia/api/src/services/riesgo-eudr.service.ts.
 * `geo-intersections` (geometría real de forest_titles) es requerida, no
 * opcional como en otros cruces de este repo -- sin ella, el endpoint entero
 * carece de sentido (no hay con qué intersectar las alertas MINAM).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = args.departamento as string | undefined;

  const geoIntersectionsPool = getPoolForApp(env as NeonEnv, "geo-intersections");
  if (!geoIntersectionsPool) {
    return { status: 200, body: { estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] } };
  }

  const codigo = departamento ? codigoDeDepartamento(departamento) : null;
  if (departamento && !codigo) {
    return { status: 200, body: [] };
  }

  const { rows: titulos } = await geoIntersectionsPool.query<ForestTitleRow>(
    `SELECT id, doc_leg, sup_sig, atributos_extra->>'SECTOR' as sector,
            ST_AsGeoJSON(geometry) as geojson
     FROM forest_titles
     ${codigo ? "WHERE nom_dep = $1" : ""}
     LIMIT 500`,
    codigo ? [codigo] : []
  );

  if (titulos.length === 0) return { status: 200, body: [] };

  const geometrias: Array<{ titulo: ForestTitleRow; feature: ForestGeometry }> = titulos
    .map((t) => {
      try {
        return { titulo: t, feature: JSON.parse(t.geojson) as ForestGeometry };
      } catch {
        return null;
      }
    })
    .filter((g): g is { titulo: ForestTitleRow; feature: ForestGeometry } => g !== null);

  if (geometrias.length === 0) return { status: 200, body: [] };

  const [minLon, minLat, maxLon, maxLat] = bbox({
    type: "GeometryCollection",
    geometries: geometrias.map((g) => g.feature),
  });

  const { rows: alertas } = await db.query<AlertaRow>(
    `SELECT longitud, latitud FROM minam_alertas_deforestacion
     WHERE longitud BETWEEN $1 AND $2 AND latitud BETWEEN $3 AND $4`,
    [minLon, maxLon, minLat, maxLat]
  );

  const resultados = geometrias.map(({ titulo, feature }) => {
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

  return { status: 200, body: resultados };
}
