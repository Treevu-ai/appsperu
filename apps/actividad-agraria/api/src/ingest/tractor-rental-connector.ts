import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { ingestRegionalMonthlyDataset } from "./regional-monthly-connector.js";

const RESOURCE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/Precio%20de%20Alquiler%20de%20Tractor.csv";
const RESOURCE_ID = "midagri-03.04-precio-alquiler-tractor-agricola-por-region";

export async function ingestTractorRental() {
  return ingestRegionalMonthlyDataset({
    resourceId: RESOURCE_ID,
    resourceUrl: RESOURCE_URL,
    tableName: "agricultural_tractor_rental",
    rejectedTableName: "agricultural_tractor_rental_rejected",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestTractorRental()
    .then((summary) => {
      console.log("Ingesta MIDAGRI tractor completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta tractor falló:", err);
      process.exit(1);
    });
}
