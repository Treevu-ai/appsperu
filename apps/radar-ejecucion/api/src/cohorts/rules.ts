import { avancePct } from "../ingest/normalize.js";

export interface CohortRule {
  id: string;
  version: number;
  nivelGobierno: string;
  funcion: string;
  minN: number;
  descripcion: string;
}

export const DEFAULT_COHORT_RULES: CohortRule[] = [
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

export interface CohortMember {
  entityCode: string;
  pim: number;
  devengado: number;
}

export type BenchmarkResult =
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
export function computeBenchmark(
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
    .map((m) => avancePct({ pim: m.pim, devengado: m.devengado }))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const targetAvance = avancePct({ pim: target.pim, devengado: target.devengado });
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
