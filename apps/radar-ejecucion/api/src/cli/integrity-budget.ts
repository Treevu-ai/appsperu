import { pool } from "../db/pool.js";
import { activeBudgetCoverage, refreshBudgetCoverageSnapshots } from "../db/budget-coverage.js";

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  await refreshBudgetCoverageSnapshots(pool);
  const coverage = await activeBudgetCoverage(pool);

  const report = {
    reporte: "integridad_presupuestal",
    generadoEn: new Date().toISOString(),
    particionesActivas: coverage,
    limitacion:
      "El reporte declara el último corte por partición de cobertura. No certifica que una partición NO_VERIFICADA cubra el universo total de la fuente.",
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("ALSOL | Integridad presupuestal");
  console.table(
    coverage.map((row) => ({
      particion: row.particion,
      año: row.anioFiscal,
      corte: row.fechaCorte,
      registros: row.registros,
      estado: row.estado,
      lotes: Array.isArray(row.lotes) ? row.lotes.join(",") : String(row.lotes),
    }))
  );
  console.log(report.limitacion);
}

main()
  .catch((error) => {
    console.error("No se pudo generar el reporte de integridad presupuestal:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
