import { pool } from "../db/pool.js";
import { GeoserverClient, sha256Hex } from "./geoserver-client.js";
import { TERRITORY_LAYERS } from "./layers.js";
import { parseDistrictProperties } from "./normalize.js";
import {
  ensureLayer,
  geometryJsonFromFeature,
  saveRawBatch,
  touchLayerIngested,
  upsertGeoFeature,
  upsertTerritory,
} from "./postgis-utils.js";

export type TerritoryIngestSummary = {
  layerName: string;
  accepted: number;
  rejected: number;
  territoriesUpserted: number;
};

async function ingestTerritoryLayer(
  geoserver: GeoserverClient,
  layerName: string,
  upsertTerritories: boolean
): Promise<TerritoryIngestSummary> {
  const client = await pool.connect();
  let accepted = 0;
  let rejected = 0;
  let territoriesUpserted = 0;

  try {
    await client.query("BEGIN");
    const layerId = await ensureLayer(client, layerName);

    for await (const { page, url } of geoserver.fetchAllFeatures(layerName)) {
      const checksum = sha256Hex(JSON.stringify(page.features));
      await saveRawBatch(client, {
        layerName,
        requestUrl: url,
        checksum,
        featureCount: page.features.length,
      });

      for (let i = 0; i < page.features.length; i += 1) {
        const feature = page.features[i];
        if (!feature.geometry) {
          rejected += 1;
          continue;
        }

        const { featureId, geometryJson } = geometryJsonFromFeature(feature, accepted + rejected + i);

        if (upsertTerritories) {
          const district = parseDistrictProperties(feature.properties);
          if (!district) {
            rejected += 1;
            continue;
          }
          await upsertGeoFeature(client, layerId, feature, featureId);
          await upsertTerritory(client, {
            ubigeo: district.ubigeo,
            departamento: district.departamento,
            provincia: district.provincia,
            distrito: district.distrito,
            geometryJson,
            sourceLayerId: layerId,
          });
          accepted += 1;
          territoriesUpserted += 1;
        } else {
          await upsertGeoFeature(client, layerId, feature, featureId);
          accepted += 1;
        }
      }
    }

    await touchLayerIngested(client, layerId, accepted);
    await client.query("COMMIT");
    return { layerName, accepted, rejected, territoriesUpserted };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runTerritoriesIngest(): Promise<TerritoryIngestSummary[]> {
  const geoserver = new GeoserverClient();
  const summaries: TerritoryIngestSummary[] = [];

  summaries.push(await ingestTerritoryLayer(geoserver, TERRITORY_LAYERS.DISTRICT, true));

  for (const layerName of [TERRITORY_LAYERS.DEPARTMENT, TERRITORY_LAYERS.PROVINCE]) {
    try {
      summaries.push(await ingestTerritoryLayer(geoserver, layerName, false));
    } catch (err) {
      console.warn(`Advertencia: no se pudo ingerir ${layerName}:`, err);
    }
  }

  return summaries;
}
