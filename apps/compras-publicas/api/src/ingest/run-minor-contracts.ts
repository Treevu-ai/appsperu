import { pool } from "../db/pool.js";
import { DEFAULT_TERRITORIAL_SCOPE, ingestSeacePublicMinorContracts, normalizeSeaceDepartmentScope } from "./oece-minor-contracts-connector.js";

const fullRun = process.argv.includes("--full");
const maxContracts = fullRun ? 0 : (process.env.MINOR_CONTRACT_MAX_CONTRACTS ? Number(process.env.MINOR_CONTRACT_MAX_CONTRACTS) : undefined);
const year = process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : undefined;
const departamentos = normalizeSeaceDepartmentScope((process.env.MINOR_CONTRACT_DEPARTAMENTOS ?? DEFAULT_TERRITORIAL_SCOPE.join(",")).split(","));

ingestSeacePublicMinorContracts({ year, maxContracts, departamentos })
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch((error) => {
    console.error("Ingesta SEACE de contratos menores falló:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
