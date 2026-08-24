import { pool } from "../db/pool.js";
import { catalogPathFromArgs, ingestLegacySeaceOrders } from "./legacy-seace-orders-connector.js";

const args = process.argv.slice(2);
const yearArg = args.indexOf("--year");
const monthsArg = args.indexOf("--months");
const year = yearArg >= 0 ? Number(args[yearArg + 1]) : Number(process.env.MINOR_CONTRACT_YEAR ?? 2026);
const months = monthsArg >= 0 ? (args[monthsArg + 1] ?? "").split(",").filter(Boolean).map(Number) : undefined;
const maxEntitiesArg = args.indexOf("--max-entities");
const maxEntities = maxEntitiesArg >= 0 ? Number(args[maxEntitiesArg + 1]) : undefined;

ingestLegacySeaceOrders({ year, months, maxEntities, catalogPath: catalogPathFromArgs(args) })
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((error) => { console.error("Ingesta histórica SEACE por entidad/RUC falló:", error); process.exitCode = 1; })
  .finally(() => pool.end());
