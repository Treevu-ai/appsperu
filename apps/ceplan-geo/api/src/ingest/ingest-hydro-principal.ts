import { HYDRO_LAYERS } from "./layers.js";
import { parseHydroPrincipalName } from "./normalize.js";
import { ingestInfrastructureLayer } from "./ingest-infrastructure.js";
import { GeoserverClient } from "./geoserver-client.js";

export async function runHydroPrincipalIngest() {
  const geoserver = new GeoserverClient();
  return ingestInfrastructureLayer(geoserver, {
    layerName: HYDRO_LAYERS.PRINCIPAL,
    infraType: "red_hidrica_principal",
    parseName: parseHydroPrincipalName,
  });
}
