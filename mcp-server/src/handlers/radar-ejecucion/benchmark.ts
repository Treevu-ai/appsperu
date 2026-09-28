import type { NeonPool, NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface EntityRow extends NeonRow {
  entity_code: string;
  nivel_gobierno: string;
}

interface CohortRow extends NeonRow {
  entity_code: string;
  pim: number | string;
  devengado: number | string;
}

/* ---------------------------------------------------------------------------
 * Pórtico de `apps/radar-ejecucion/api/src/cohorts/rules.ts`. El route de
 * origen delega el cálculo en `computeBenchmark` + `DEFAULT_COHORT_RULES`, así
 * que el handler tiene que llevar la misma lógica: no basta con copiar el SQL.
 * ------------------------------------------------------------------------- */
interface CohortRule {
  id: string;
  version: number;
  nivelGobierno: string;
  funcion: string;
  minN: number;
  descripcion: string;
}

const DEFAULT_COHORT_RULES: CohortRule[] = [
  {
    id: "gobierno-local-por-funcion",
    version: 1,
    nivelGobierno: "GOBIERNO_LOCAL",
    funcion: "*",
    minN: 5,
    descripcion: "Municipalidades comparadas dentro de la misma función de gasto.",
  },
  {
    id: "gobierno-regional-por-funcion",
    version: 1,
    nivelGobierno: "GOBIERNO_REGIONAL",
    funcion: "*",
    minN: 5,
    descripcion: "Gobiernos regionales comparados dentro de la misma función de gasto.",
  },
];

interface CohortMember {
  entityCode: string;
  pim: number;
  devengado: number;
}

type BenchmarkResult =
  | {
      status: "ok";
      n: number;
      percentil: number;
      medianaAvancePct: number;
      criterios: string;
      exclusiones: string;
    }
  | {
      status: "datos_insuficientes";
      n: number;
      minRequerido: number;
      criterios: string;
    };

/** Igual que `avancePct` de `apps/radar-ejecucion/api/src/ingest/normalize.ts`. */
function avancePct(pim: number, devengado: number): number | null {
  if (pim <= 0) return null;
  return Math.round((devengado / pim) * 10000) / 100;
}

function percentileRank(sortedValues: number[], value: number): number {
  const below = sortedValues.filter((v) => v < value).length;
  return Math.round((below / sortedValues.length) * 100);
}

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

/**
 * Compara una entidad contra su cohorte. Nunca devuelve un número si `n < minN`
 * de la regla — responde un estado explícito en su lugar (gate de comparabilidad,
 * sección 7 del documento fuente).
 */
function computeBenchmark(
  targetEntityCode: string,
  cohort: CohortMember[],
  rule: CohortRule
): BenchmarkResult {
  const criterios = `nivel_gobierno=${rule.nivelGobierno}, funcion=${rule.funcion}, regla=${rule.id} v${rule.version}`;

  if (cohort.length < rule.minN) {
    return { status: "datos_insuficientes", n: cohort.length, minRequerido: rule.minN, criterios };
  }

  const target = cohort.find((m) => m.entityCode === targetEntityCode);
  if (!target) {
    return { status: "datos_insuficientes", n: cohort.length, minRequerido: rule.minN, criterios };
  }

  const avances = cohort
    .map((m) => avancePct(m.pim, m.devengado))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const targetAvance = avancePct(target.pim, target.devengado);
  if (targetAvance === null || avances.length < rule.minN) {
    return { status: "datos_insuficientes", n: cohort.length, minRequerido: rule.minN, criterios };
  }

  return {
    status: "ok",
    n: cohort.length,
    percentil: percentileRank(avances, targetAvance),
    medianaAvancePct: median(avances),
    criterios,
    exclusiones: "Entidades con PIM = 0 excluidas del cálculo de avance.",
  };
}

/**
 * Handler para `radar_ejecucion_benchmark` — GET /api/benchmark/{entityCode}
 * Compara la ejecución de una entidad contra su cohorte (mismo nivel de gobierno)
 * en un año fiscal dado. Devuelve 422 si no hay regla de cohorte definida para
 * su nivel_gobierno, en vez de publicar un benchmark sin base.
 */
export async function byEntityCode(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const entityCode = args.entityCode as string;
  const anio = args.anio ? Number(args.anio) : new Date().getFullYear();

  const { rows: entityRows } = await db.query<EntityRow>(
    `SELECT entity_code, nivel_gobierno FROM entities WHERE entity_code = $1`,
    [entityCode]
  );

  if (entityRows.length === 0) {
    return { status: 404, body: { error: "Entidad no encontrada." } };
  }

  const nivelGobierno = entityRows[0].nivel_gobierno;
  const rule = DEFAULT_COHORT_RULES.find((r) => r.nivelGobierno === nivelGobierno);

  if (!rule) {
    return {
      status: 422,
      body: {
        error: `No hay regla de cohorte definida para nivel_gobierno=${nivelGobierno}. No se publica benchmark sin regla explícita.`,
      },
    };
  }

  const { rows: cohortRows } = await db.query<CohortRow>(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code, b.pim, b.devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE e.nivel_gobierno = $1 AND b.anio_fiscal = $2`,
    [nivelGobierno, anio]
  );

  const cohort = cohortRows.map((r) => ({
    entityCode: r.entity_code,
    pim: Number(r.pim),
    devengado: Number(r.devengado),
  }));

  const result = computeBenchmark(entityCode, cohort, rule);

  return {
    status: 200,
    body: {
      entityCode,
      anioFiscal: anio,
      ...result,
      fechaCorte: new Date().toISOString().slice(0, 10),
    },
  };
}