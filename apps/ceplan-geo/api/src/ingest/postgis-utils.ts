import type { PoolClient } from "pg";
import type { GeoJsonFeature } from "./geoserver-client.js";
import { featureIdFromGeoJson } from "./normalize.js";

export async function ensureLayer(
  client: PoolClient,
  layerName: string,
  layerTitle: string | null = null
): Promise<string> {
  const workspace = layerName.includes(":") ? layerName.split(":")[0] : null;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO geo_layers (layer_name, layer_title, workspace, service_type)
     VALUES ($1, $2, $3, 'WFS')
     ON CONFLICT (layer_name) DO UPDATE
       SET layer_title = COALESCE(EXCLUDED.layer_title, geo_layers.layer_title),
           workspace = COALESCE(EXCLUDED.workspace, geo_layers.workspace),
           updated_at = now()
     RETURNING id`,
    [layerName, layerTitle, workspace]
  );
  return rows[0].id;
}

export async function saveRawBatch(
  client: PoolClient,
  input: {
    layerName: string;
    requestUrl: string;
    checksum: string;
    featureCount: number;
    payload?: unknown;
  }
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_geoserver_batches (layer_name, request_url, checksum, feature_count, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.layerName, input.requestUrl, input.checksum, input.featureCount, input.payload ?? null]
  );
  return rows[0].id;
}

export async function upsertGeoFeature(
  client: PoolClient,
  layerId: string,
  feature: GeoJsonFeature,
  featureId: string
): Promise<void> {
  await client.query(
    `INSERT INTO geo_features (layer_id, feature_id, geometry, properties)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4::jsonb)
     ON CONFLICT (layer_id, feature_id) DO UPDATE
       SET geometry = EXCLUDED.geometry,
           properties = EXCLUDED.properties,
           updated_at = now()`,
    [layerId, featureId, JSON.stringify(feature.geometry), JSON.stringify(feature.properties ?? {})]
  );
}

export async function upsertTerritory(
  client: PoolClient,
  input: {
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    geometryJson: string;
    sourceLayerId: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO territories (ubigeo, departamento, provincia, distrito, geometry, source_layer_id)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6)
     ON CONFLICT (ubigeo) DO UPDATE
       SET departamento = EXCLUDED.departamento,
           provincia = EXCLUDED.provincia,
           distrito = EXCLUDED.distrito,
           geometry = EXCLUDED.geometry,
           source_layer_id = EXCLUDED.source_layer_id,
           updated_at = now()`,
    [
      input.ubigeo,
      input.departamento,
      input.provincia,
      input.distrito,
      input.geometryJson,
      input.sourceLayerId,
    ]
  );
}

export async function upsertInfrastructure(
  client: PoolClient,
  input: {
    infraType: string;
    name: string;
    geometryJson: string;
    properties: Record<string, unknown>;
    sourceLayerId: string;
    featureId: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO infrastructure (infra_type, name, geometry, properties, source_layer_id, feature_id)
     VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4::jsonb, $5, $6)
     ON CONFLICT (source_layer_id, feature_id) DO UPDATE
       SET infra_type = EXCLUDED.infra_type,
           name = EXCLUDED.name,
           geometry = EXCLUDED.geometry,
           properties = EXCLUDED.properties,
           updated_at = now()`,
    [
      input.infraType,
      input.name,
      input.geometryJson,
      JSON.stringify(input.properties),
      input.sourceLayerId,
      input.featureId,
    ]
  );
}

export async function touchLayerIngested(client: PoolClient, layerId: string, featureCount: number): Promise<void> {
  await client.query(
    `UPDATE geo_layers
     SET feature_count = $2,
         last_ingested_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [layerId, featureCount]
  );
}

export function geometryJsonFromFeature(feature: GeoJsonFeature, fallbackIndex: number): {
  featureId: string;
  geometryJson: string;
} {
  return {
    featureId: featureIdFromGeoJson(feature, fallbackIndex),
    geometryJson: JSON.stringify(feature.geometry),
  };
}
