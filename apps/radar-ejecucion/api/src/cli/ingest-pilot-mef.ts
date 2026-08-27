import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { PILOT_DEPARTMENTS } from "../lib/pilot-departments.js";
import {
  ingestMefFullYearForDepartamento,
  ingestMefFullYearForMetaDepartamento,
} from "../ingest/mef-connector.js";

async function main() {
  const filename = process.env.MEF_DATA_FILENAME;
  if (!filename) {
    throw new Error("Define MEF_DATA_FILENAME (ej. 2026-Gasto-Mensual.csv)");
  }

  const only = process.env.MEF_PILOT_DEPARTAMENTOS?.split(",").map((d) => d.trim().toUpperCase());
  const departamentos = only?.length ? only : [...PILOT_DEPARTMENTS];

  const results: unknown[] = [];

  for (const departamento of departamentos) {
    const entry: Record<string, unknown> = { departamento };

    try {
      console.log(`\n=== MEF ejecutora (GR/GL): ${departamento} ===`);
      entry.ejecutora = await ingestMefFullYearForDepartamento(filename, departamento);
      console.log("Ejecutora:", entry.ejecutora);
    } catch (err) {
      entry.ejecutoraError = err instanceof Error ? err.message : String(err);
      console.error(`Ejecutora falló para ${departamento}:`, entry.ejecutoraError);
    }

    try {
      console.log(`\n=== MEF meta (GN dirigido): ${departamento} ===`);
      entry.meta = await ingestMefFullYearForMetaDepartamento(filename, departamento);
      console.log("Meta:", entry.meta);
    } catch (err) {
      entry.metaError = err instanceof Error ? err.message : String(err);
      console.error(`Meta falló para ${departamento}:`, entry.metaError);
    }

    results.push(entry);
  }

  console.log("\n=== Resumen piloto ALSOL ===");
  console.log(JSON.stringify(results, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
