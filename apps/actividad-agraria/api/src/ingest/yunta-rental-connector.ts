import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { ingestRegionalMonthlyDataset } from "./regional-monthly-connector.js";

const RESOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/precioxyunta.csv";
const RESOURCE_ID = "midagri-03.05-precio-alquiler-yunta-por-region";

export async function ingestYuntaRental() {
  return ingestRegionalMonthlyDataset({
    resourceId: RESOURCE_ID,
    resourceUrl: RESOURCE_URL,
    tableName: "agricultural_yunta_rental",
    rejectedTableName: "agricultural_yunta_rental_rejected",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestYuntaRental()
    .then((summary) => {
      console.log("Ingesta MIDAGRI yunta completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta yunta falló:", err);
      process.exit(1);
    });
}
