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

  // Si el ingest de MINAM nunca corrió (tabla vacía), toda alerta cuenta 0 y
  // `clasificarRiesgo(0)` daría BAJO para CADA título — indistinguible de
  // "revisamos y no hay riesgo". Se corta antes de clasificar nada, mismo
  // criterio que la ruta HTTP (que ahí lanza un error 503 en vez de devolver
  // este status — el handler MCP sigue la convención de este archivo de
  // nunca lanzar, siempre responder con un status explícito).
  const { rows: disponibilidad } = await db.query<{ existe: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM minam_alertas_deforestacion LIMIT 1) as existe`
  );
  if (!disponibilidad[0]?.existe) {
    return { status: 200, body: { estado: "MINAM_NO_DISPONIBLE", resultados: [] } };
  }

  const { rows: titulos } = await geoIntersectionsPool.query<ForestTitleRow>(
    `SELECT id, doc_leg, sup_sig, atributos_extra->>'SECTOR' as sector,
            ST_AsGeoJSON(geometry) as geojson
     FROM forest_titles
     ${codigo ? "WHERE nom_dep = $1" : ""}
     ORDER BY id
     LIMIT 500`,
    codigo ? [codigo] : []
  );
  // Tope de 500 títulos — ver nota equivalente en la ruta HTTP de origen.

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
    // Pre-filtra por el bbox propio del título antes del point-in-polygon —
    // ver nota equivalente en la ruta HTTP de origen.
    const [tMinLon, tMinLat, tMaxLon, tMaxLat] = bbox(feature);
    const candidatas = alertas.filter(
      (a) => a.longitud >= tMinLon && a.longitud <= tMaxLon && a.latitud >= tMinLat && a.latitud <= tMaxLat
    );
    const conteoAlertas = candidatas.reduce(
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
