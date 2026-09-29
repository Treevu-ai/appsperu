import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * @fidelity: precomputado
 *
 * `findNearbyInfrastructure` es un port literal de
 * `apps/ceplan-geo/api/src/crossref/nearby-infrastructure.ts`, ya incluido
 * por este marcador (mismo SELECT, sin cambios).
 */

interface InfrastructureRow extends NeonRow {
  infra_type: string;
  name: string;
  properties: Record<string, unknown>;
  geometry_geojson: string | null;
}

interface NearbyRow extends NeonRow {
  infra_type: string;
  name: string;
  distance_km: string;
  properties: Record<string, unknown>;
}

/**
 * Copiado de `apps/ceplan-geo/api/src/crossref/nearby-infrastructure.ts`.
 * PostGIS: `ST_Distance`/`ST_DWithin` sobre `::geography` — requiere
 * `postgis` habilitada en la base `ceplan_geo` de Neon.
 */
async function findNearbyInfrastructure(
  db: ToolHandlerContext["db"],
  ubigeo: string,
  radiusKm: number,
  infraType?: string
) {
  const params: unknown[] = [ubigeo, radiusKm * 1000];
  let typeFilter = "";
  if (infraType) {
    params.push(infraType);
    typeFilter = `AND i.infra_type = $${params.length}`;
  }

  const { rows } = await db.query<NearbyRow>(
    `SELECT i.infra_type, i.name,
            ST_Distance(
              i.geometry::geography,
              ST_Centroid(t.geometry)::geography
            ) / 1000 AS distance_km,
            i.properties
     FROM infrastructure i
     JOIN territories t ON t.ubigeo = $1
     WHERE ST_DWithin(
             i.geometry::geography,
             ST_Centroid(t.geometry)::geography,
             $2
           )
       ${typeFilter}
     ORDER BY distance_km
     LIMIT 10`,
    params
  );

  return rows.map((row) => ({
    infraType: row.infra_type,
    name: row.name,
    distanceKm: Math.round(Number(row.distance_km) * 100) / 100,
    properties: row.properties ?? {},
  }));
}

/**
 * Handler para `ceplan_geo_infrastructure` — GET /api/infrastructure.
 * Idéntico a `apps/ceplan-geo/api/src/routes/infrastructure.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const type = args.type as string | undefined;
  const departamento = args.departamento as string | undefined;

  const params: unknown[] = [];
  const conditions: string[] = [];
  if (type) {
    params.push(type);
    conditions.push(`infra_type = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento);
    conditions.push(`properties->>'iddpto' = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<InfrastructureRow>(
    `SELECT infra_type, name, properties, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM infrastructure
     ${where}
     ORDER BY name
     LIMIT 1000`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((row) => ({
        infraType: row.infra_type,
        name: row.name,
        properties: row.properties,
        geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
      })),
    },
  };
}

/**
 * Handler para `ceplan_geo_infrastructure_near` — GET /api/infrastructure/near.
 * Idéntico a `apps/ceplan-geo/api/src/routes/infrastructure.ts` (`/near`).
 */
export async function near(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string;
  const radiusKm = args.radius_km !== undefined ? Number(args.radius_km) : 50;
  const type = args.type as string | undefined;

  const resultados = await findNearbyInfrastructure(db, ubigeo, radiusKm, type);

  return {
    status: 200,
    body: {
      ubigeo,
      radiusKm,
      resultados,
      restriccion: "Proximidad calculada al centroide del distrito; no implica accesibilidad real.",
    },
  };
}

export { findNearbyInfrastructure };
