import { pool } from "../db/pool.js";
import { ingestOecdReleases, normalizeDepartamentoScope, PERU_DEPARTAMENTOS } from "./oece-connector.js";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const full = args.includes("--full");
const maxPagesValue = value("--max-pages");
const maxPages = full ? 0 : maxPagesValue ? Number(maxPagesValue) : undefined;
const startPage = Number(value("--start-page") ?? 1);
const startDate = value("--start-date");
const endDate = value("--end-date");
const dataSegmentationID = value("--segmentation-id");
if (!startDate || !endDate) throw new Error("Usa --start-date YYYY-MM-DD y --end-date YYYY-MM-DD; una corrida general sin ventana no es aceptada.");

const departamentos = normalizeDepartamentoScope(undefined, (process.env.OECE_DEPARTAMENTOS ?? PERU_DEPARTAMENTOS.join(",")).split(","));

ingestOecdReleases({ maxPages, startPage, departamentos, params: { startDate, endDate, dataSegmentationID } })
  .then((summary) => console.log(JSON.stringify({ scope: { departments: departamentos, startDate, endDate, dataSegmentationID }, ...summary }, null, 2)))
  .catch((error) => { console.error("Ingesta OECE de procesos falló:", error); process.exitCode = 1; })
  .finally(() => pool.end());
