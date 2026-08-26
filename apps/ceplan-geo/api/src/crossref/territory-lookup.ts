import { pool } from "../db/pool.js";
import { normalizeTerritoryToken } from "../ingest/normalize.js";

export type TerritoryMatchStatus = "confirmada" | "candidata" | "sin_match";

export type TerritoryRecord = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometryGeojson: string | null;
};

export async function getTerritoryByUbigeo(ubigeo: string): Promise<TerritoryRecord | null> {
  const { rows } = await pool.query<{
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    geometry_geojson: string | null;
  }>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ubigeo = $1`,
    [ubigeo]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ubigeo: row.ubigeo,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    geometryGeojson: row.geometry_geojson,
  };
}

export async function lookupTerritoryByNames(
  departamento: string | null | undefined,
  provincia: string | null | undefined,
  distrito: string | null | undefined
): Promise<{ territory: TerritoryRecord | null; matchStatus: TerritoryMatchStatus }> {
  const dept = normalizeTerritoryToken(departamento);
  const prov = normalizeTerritoryToken(provincia);
  const dist = normalizeTerritoryToken(distrito);

  if (!dept) return { territory: null, matchStatus: "sin_match" };

  const params: string[] = [dept];
  const conditions = ["UPPER(departamento) = $1"];

  if (prov) {
    params.push(prov);
    conditions.push(`UPPER(COALESCE(provincia, '')) = $${params.length}`);
  }
  if (dist) {
    params.push(dist);
    conditions.push(`UPPER(COALESCE(distrito, '')) = $${params.length}`);
  }

  const { rows } = await pool.query<{
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    geometry_geojson: string | null;
  }>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ${conditions.join(" AND ")}`,
    params
  );

  if (rows.length === 0) return { territory: null, matchStatus: "sin_match" };
  if (rows.length > 1) {
    const row = rows[0];
    return {
      territory: {
        ubigeo: row.ubigeo,
        departamento: row.departamento,
        provincia: row.provincia,
        distrito: row.distrito,
        geometryGeojson: row.geometry_geojson,
      },
      matchStatus: "candidata",
    };
  }

  const row = rows[0];
  return {
    territory: {
      ubigeo: row.ubigeo,
      departamento: row.departamento,
      provincia: row.provincia,
      distrito: row.distrito,
      geometryGeojson: row.geometry_geojson,
    },
    matchStatus: "confirmada",
  };
}
