import { pool } from "../db/pool.js";
import { GeoserverClient, sha256Hex } from "./geoserver-client.js";
import type { InfraType } from "./layers.js";
import {
  parseAgroProjectName,
  parseHydroPrincipalName,
  parseInfrastructureName,
} from "./normalize.js";
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
  infraType: InfraType;
  accepted: number;
  rejected: number;
};

export type InfrastructureLayerConfig = {
  layerName: string;
  infraType: InfraType;
  parseName: (properties: Record<string, unknown> | null) => string | null;
};

const CLASSIC_LAYERS: InfrastructureLayerConfig[] = [
  {
    layerName: "geoceplan:cn_aeropuertosx",
    infraType: "aeropuerto",
    parseName: (properties) => parseInfrastructureName(properties, "aeropuerto"),
  },
  {
    layerName: "geoceplan:cn_puertosx",
    infraType: "puerto",
    parseName: (properties) => parseInfrastructureName(properties, "puerto"),
  },
];

export async function ingestInfrastructureLayer(
  geoserver: GeoserverClient,
  config: InfrastructureLayerConfig
): Promise<InfrastructureIngestSummary> {
  const { layerName, infraType, parseName } = config;
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

        const name = parseName(feature.properties ?? null);
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

export async function runInfrastructureIngest(
  configs: InfrastructureLayerConfig[] = CLASSIC_LAYERS
): Promise<InfrastructureIngestSummary[]> {
  const geoserver = new GeoserverClient();
  const summaries: InfrastructureIngestSummary[] = [];

  for (const config of configs) {
    summaries.push(await ingestInfrastructureLayer(geoserver, config));
  }

  return summaries;
}
