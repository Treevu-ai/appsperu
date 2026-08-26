import { pool } from "../db/pool.js";
import { GeoserverClient, sha256Hex } from "./geoserver-client.js";
import { INFRASTRUCTURE_LAYERS } from "./layers.js";
import { parseInfrastructureName } from "./normalize.js";
import {
  ensureLayer,
  geometryJsonFromFeature,
  saveRawBatch,
  touchLayerIngested,
  upsertGeoFeature,
  upsertInfrastructure,
} from "./postgis-utils.js";

export type InfrastructureIngestSummary = {
  layerName: string;
  infraType: string;
  accepted: number;
  rejected: number;
};

const LAYER_TO_TYPE: Record<string, "aeropuerto" | "puerto"> = {
  [INFRASTRUCTURE_LAYERS.AIRPORTS]: "aeropuerto",
  [INFRASTRUCTURE_LAYERS.PORTS]: "puerto",
};

async function ingestInfrastructureLayer(
  geoserver: GeoserverClient,
  layerName: string,
  infraType: "aeropuerto" | "puerto"
): Promise<InfrastructureIngestSummary> {
  const client = await pool.connect();
  let accepted = 0;
  let rejected = 0;

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

        const name = parseInfrastructureName(feature.properties, infraType);
        if (!name) {
          rejected += 1;
          continue;
        }

        const { featureId, geometryJson } = geometryJsonFromFeature(feature, accepted + rejected + i);
        await upsertGeoFeature(client, layerId, feature, featureId);
        await upsertInfrastructure(client, {
          infraType,
          name,
          geometryJson,
          properties: feature.properties ?? {},
          sourceLayerId: layerId,
          featureId,
        });
        accepted += 1;
      }
    }

    await touchLayerIngested(client, layerId, accepted);
    await client.query("COMMIT");
    return { layerName, infraType, accepted, rejected };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runInfrastructureIngest(): Promise<InfrastructureIngestSummary[]> {
  const geoserver = new GeoserverClient();
  const summaries: InfrastructureIngestSummary[] = [];

  for (const layerName of Object.values(INFRASTRUCTURE_LAYERS)) {
    summaries.push(await ingestInfrastructureLayer(geoserver, layerName, LAYER_TO_TYPE[layerName]));
  }

  return summaries;
}
