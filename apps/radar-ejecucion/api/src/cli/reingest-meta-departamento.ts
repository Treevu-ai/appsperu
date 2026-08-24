import { ingestMefFullYearForMetaDepartamento } from "../ingest/mef-connector.js";
import { pool } from "../db/pool.js";

async function main(): Promise<void> {
  const [departamento, filename = process.env.MEF_DATA_FILENAME ?? "2026-Gasto-Mensual.csv"] = process.argv.slice(2);
  if (!departamento) {
    throw new Error("Uso: npm run ingest:mef:meta -- <DEPARTAMENTO> [archivo-mef.csv]");
  }

  const summary = await ingestMefFullYearForMetaDepartamento(filename, departamento);
  console.log("Reingesta por meta territorial completada:", summary);
}

main()
  .catch((error) => {
    console.error("La reingesta por meta territorial falló:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
