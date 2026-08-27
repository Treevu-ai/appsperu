import { pathToFileURL } from "node:url";
import { ejecucionPool } from "../db/ejecucion-pool.js";

const DEFAULT_DEPARTAMENTOS = ["LA LIBERTAD"] as const;

export function parseDepartamentoScope(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") return [...DEFAULT_DEPARTAMENTOS];
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value !== "");
}

/**
 * `salud-institucional` no tiene base propia ni ingesta: es un score
 * derivado que combina 5 fuentes ya cruzadas (`score/compute.ts`) —
 * radar-ejecucion, infobras, radar-inversiones, compras-publicas e
 * identidad-fiscal. Por eso no puede "certificar" datos propios en
 * `territorial_coverage`; lo que certifica es que las 5 fuentes de las
 * que depende están, cada una, `COMPLETA_VERIFICADA` para ese
 * departamento. Si falta una, el score de esa entidad se calcula igual
 * (el compute.ts omite componentes faltantes) pero la cobertura territorial
 * no puede declararse completa — sería afirmar más certeza de la que hay.
 */
const DEPENDENCY_APPS = [
  "radar-ejecucion",
  "infobras",
  "radar-inversiones",
  "compras-publicas",
  "identidad-fiscal",
] as const;

interface DependencyRow {
  app_name: string;
  source_name: string;
  completeness: string;
  source_batch_ref: string | null;
  cutoff_at: string | null;
  persisted_records: string | null;
}

function isClaimable(row: DependencyRow): boolean {
  return (
    row.completeness === "COMPLETA_VERIFICADA" &&
    Boolean(row.source_batch_ref) &&
    Boolean(row.cutoff_at) &&
    row.persisted_records !== null
  );
}

export async function materializeSaludInstitucionalCoverage(
  departamentos: readonly string[]
): Promise<{ jurisdictions: number; results: { departamento: string; completeness: string }[] }> {
  const { rows: jurisdictionRows } = await ejecucionPool.query<{ code: string; name: string }>(
    "SELECT code, name FROM territorial_jurisdictions WHERE name = ANY($1)",
    [departamentos]
  );
  if (jurisdictionRows.length !== departamentos.length) {
    const found = new Set(jurisdictionRows.map((row) => row.name));
    const missing = departamentos.filter((name) => !found.has(name));
    throw new Error(`Jurisdicción(es) no encontradas en territorial_jurisdictions: ${missing.join(", ")}`);
  }

  const results: { departamento: string; completeness: string }[] = [];

  for (const jurisdiction of jurisdictionRows) {
    const { rows: depRows } = await ejecucionPool.query<DependencyRow>(
      `SELECT DISTINCT ON (app_name) app_name, source_name, completeness, source_batch_ref, cutoff_at, persisted_records::text
         FROM territorial_coverage
        WHERE jurisdiction_code=$1 AND app_name = ANY($2)
        ORDER BY app_name, created_at DESC`,
      [jurisdiction.code, DEPENDENCY_APPS]
    );
    const byApp = new Map(depRows.map((row) => [row.app_name, row]));
    const missingOrBlocked = DEPENDENCY_APPS.filter((app) => {
      const row = byApp.get(app);
      return !row || !isClaimable(row);
    });

    const completeness = missingOrBlocked.length === 0 ? "COMPLETA_VERIFICADA" : "PARCIAL";
    const dependencies = DEPENDENCY_APPS.map((app) => {
      const row = byApp.get(app);
      return {
        app,
        claimable: row ? isClaimable(row) : false,
        source_batch_ref: row?.source_batch_ref ?? null,
      };
    });
    const restriction =
      missingOrBlocked.length === 0
        ? "Score derivado (score/compute.ts): promedio simple de hasta 5 componentes por entidad " +
          "(ejecución, obras no paralizadas, inversiones sin sobrecosto, compras no concentradas, " +
          "salud tributaria de proveedores). Las 5 fuentes base están COMPLETA_VERIFICADA para este " +
          "departamento; una entidad individual puede seguir mostrando menos de 5 componentes si esa " +
          "entidad puntual no aparece en alguna fuente (ver componentesUsados por entidad)."
        : `Score derivado bloqueado: falta certificación territorial de ${missingOrBlocked.join(", ")} ` +
          "para este departamento en territorial_coverage.";

    const componentesDisponibles = DEPENDENCY_APPS.length - missingOrBlocked.length;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       VALUES ('salud-institucional','SCORE_DERIVADO_5_FUENTES',$1,true,$2,$2,$2,$3,$4,$5,now(),$6,$7::jsonb)`,
      [
        jurisdiction.code,
        componentesDisponibles,
        missingOrBlocked.length,
        completeness,
        `salud-institucional:derivado:${jurisdiction.code}`,
        restriction,
        JSON.stringify(dependencies),
      ]
    );
    results.push({ departamento: jurisdiction.name, completeness });
  }

  return { jurisdictions: jurisdictionRows.length, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamentos = parseDepartamentoScope(process.env.SALUD_INSTITUCIONAL_DEPARTAMENTOS);
  materializeSaludInstitucionalCoverage(departamentos)
    .then((summary) => console.log("Cobertura salud-institucional materializada:", summary))
    .finally(async () => {
      await ejecucionPool.end();
    })
    .catch((error) => {
      console.error("No se pudo materializar cobertura salud-institucional:", error);
      process.exitCode = 1;
    });
}
