import { PROJECT_LAYERS } from "./layers.js";
import { parseAgroProjectName } from "./normalize.js";
import { ingestInfrastructureLayer } from "./ingest-infrastructure.js";
import { GeoserverClient } from "./geoserver-client.js";

export async function runProjectsSectorialIngest() {
  const geoserver = new GeoserverClient();
  return ingestInfrastructureLayer(geoserver, {
    layerName: PROJECT_LAYERS.AGRO,
    infraType: "proyecto_sectorial_agro",
    parseName: parseAgroProjectName,
  });
}
