import { pool } from "../db/pool.js";
import { GeoserverClient } from "./geoserver-client.js";
import { ensureLayer } from "./postgis-utils.js";

export type DiscoverySummary = {
  discovered: number;
  upserted: number;
};

export async function runDiscovery(client = GeoserverClient): Promise<DiscoverySummary> {
  const geoserver = new client();
  const { layers } = await geoserver.fetchCapabilities();

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    let upserted = 0;
    for (const layer of layers) {
      await ensureLayer(db, layer.layerName, layer.layerTitle);
      upserted += 1;
    }
    await db.query("COMMIT");
    return { discovered: layers.length, upserted };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}
