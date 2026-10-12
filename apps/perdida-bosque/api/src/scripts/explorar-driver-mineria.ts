import "dotenv/config";
import { createGeostore, type GeoJSONPolygon } from "../lib/gfw-client.js";

const GFW_BASE_URL = "https://data-api.globalforestwatch.org";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.GFW_API_KEY ?? "",
    Origin: "http://localhost",
  };
}

async function main(): Promise<void> {
  const geometry: GeoJSONPolygon = JSON.parse(process.env.GEOM_JSON ?? "null") as GeoJSONPolygon;

  const { geostoreId, areaHa } = await createGeostore(geometry);
  console.log(`geostoreId=${geostoreId} areaHa=${areaHa}`);

  const sql = "SELECT wri_google_tree_cover_loss_drivers__category, SUM(area__ha) FROM data GROUP BY wri_google_tree_cover_loss_drivers__category";
  const url = new URL(`${GFW_BASE_URL}/dataset/wri_google_tree_cover_loss_drivers/latest/query/json`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("geostore_id", geostoreId);
  const res = await fetch(url, { headers: headers() });
  console.log("status:", res.status);
  console.log(JSON.stringify(await res.json(), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
