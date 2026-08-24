import { pool } from "../db/pool.js";
import { ingestSeacePublicMinorContracts } from "./oece-minor-contracts-connector.js";

const fullRun = process.argv.includes("--full");
const maxContracts = fullRun ? 0 : (process.env.MINOR_CONTRACT_MAX_CONTRACTS ? Number(process.env.MINOR_CONTRACT_MAX_CONTRACTS) : undefined);
const year = process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : undefined;

ingestSeacePublicMinorContracts({ year, maxContracts })
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((error) => {
    console.error("Ingesta SEACE de contratos menores falló:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
