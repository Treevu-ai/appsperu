import "dotenv/config";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { PILOT_DEPARTMENTS } from "../lib/pilot-departments.js";
import { ingestMefFullYearForDepartamento } from "../ingest/mef-connector.js";

async function main() {
  const filename = process.env.MEF_DATA_FILENAME;
  if (!filename) throw new Error("Define MEF_DATA_FILENAME (ej. 2026-Gasto-Mensual.csv)");

  const only = process.env.MEF_PILOT_DEPARTAMENTOS?.split(",").map((d) => d.trim().toUpperCase());
  const departamentos = only?.length ? only : [...PILOT_DEPARTMENTS];
  const results: unknown[] = [];

  for (const departamento of departamentos) {
    console.log(`\n=== MEF ejecutora (GR/GL): ${departamento} ===`);
    try {
      const ejecutora = await ingestMefFullYearForDepartamento(filename, departamento);
      console.log("Ejecutora:", ejecutora);
      results.push({ departamento, ejecutora });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Ejecutora falló para ${departamento}:`, msg);
      results.push({ departamento, ejecutoraError: msg });
    }
  }

  console.log("\n=== Resumen ejecutora piloto ===");
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
