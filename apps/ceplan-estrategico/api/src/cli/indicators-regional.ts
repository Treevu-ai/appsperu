import "dotenv/config";
import { isPilotDepartment } from "../lib/pilot-departments.js";
import { loadLatestCumpIndicators, loadMaxAnioEjecucion, buildNationalLevel } from "../lib/indicators/ceplan-national.js";
import { loadDepartmentProxyMetrics } from "../lib/indicators/department-proxy.js";
import { loadPlanBudgetAlignment } from "../lib/indicators/plan-budget-alignment.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "../ingest/field-mapping.js";

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const departamento = readArg("--departamento")?.toUpperCase().trim();
  const anioArg = readArg("--anio");
  const anio = anioArg ? Number(anioArg) : undefined;

  if (!departamento || !isPilotDepartment(departamento)) {
    console.error(
      JSON.stringify({
        error: "Indique --departamento en piloto ALSOL (LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO).",
      })
    );
    process.exit(1);
  }

  const [cumpRows, anioEjecucion, proxy, pbaAnio] = await Promise.all([
    loadLatestCumpIndicators(),
    loadMaxAnioEjecucion(),
    loadDepartmentProxyMetrics(departamento, anio),
    anio ?? loadMaxAnioEjecucion(),
  ]);

  const pba = await loadPlanBudgetAlignment(departamento, pbaAnio ?? new Date().getFullYear());

  const output = {
    departamento,
    generadoEl: new Date().toISOString(),
    seg: {
      variante: "PROXY_DEPARTAMENTAL",
      segPp: proxy?.segPp ?? null,
      ejecucionPresupuestalPct: proxy?.ejecucionPresupuestalPct ?? null,
      avanceFisicoMedioPct: proxy?.avanceFisicoMedioPct ?? null,
      restriccion: proxy?.restriccion ?? null,
    },
    executionEfficiency: {
      variante: "PROXY_DEPARTAMENTAL",
      executionEfficiency: proxy?.executionEfficiency ?? null,
      restriccion: proxy?.restriccion ?? null,
    },
    marcoNacionalCeplan: [...CROSSREFEABLE_NIVELES_GOBIERNO].map((nivel) => buildNationalLevel(cumpRows, nivel, anioEjecucion)),
    planBudgetAlignment: pba,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
