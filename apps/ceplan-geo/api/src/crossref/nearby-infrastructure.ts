import { pool } from "../db/pool.js";

export type NearbyInfrastructure = {
  infraType: string;
  name: string;
  distanceKm: number;
  properties: Record<string, unknown>;
};

export async function findNearbyInfrastructure(
  ubigeo: string,
  radiusKm: number,
  infraType?: string
): Promise<NearbyInfrastructure[]> {
  const params: unknown[] = [ubigeo, radiusKm * 1000];
  let typeFilter = "";
  if (infraType) {
    params.push(infraType);
    typeFilter = `AND i.infra_type = $${params.length}`;
  }

  const { rows } = await pool.query<{
    infra_type: string;
    name: string;
    distance_km: string;
    properties: Record<string, unknown>;
  }>(
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
