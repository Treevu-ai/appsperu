import { ejecucionPool } from "../../db/ejecucion-pool.js";
import { infobrasPool } from "../../db/infobras-pool.js";
import { LATEST_BUDGET_CTE } from "./budget-sql.js";
import { round2, round3 } from "./ceplan-national.js";

export type DepartmentProxyMetrics = {
  anio: number;
  ejecucionPresupuestalPct: number | null;
  avanceFisicoMedioPct: number | null;
  segPp: number | null;
  executionEfficiency: number | null;
  pim: number;
  devengado: number;
  obrasConAvance: number;
  restriccion: string | null;
  dependencias: Array<{ app: string; ok: boolean; error?: string }>;
};

const PROXY_RESTRICCION =
  "Proxy departamental MEF+INFOBRAS; no equivale a SEG CEPLAN regional ni a desempeño estratégico por territorio.";

export async function loadDepartmentProxyMetrics(
  departamento: string,
  anio?: number
): Promise<DepartmentProxyMetrics | null> {
  const anioFiscal =
    anio ??
  (
    await ejecucionPool.query<{ max: number | null }>(`SELECT MAX(anio_fiscal) AS max FROM budget_execution`)
  ).rows[0]?.max;

  if (!anioFiscal) {
    return null;
  }

  const { rows: budgetRows } = await ejecucionPool.query<{ pim: string; devengado: string }>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0)::text AS pim, COALESCE(SUM(b.devengado), 0)::text AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.anio_fiscal = $1
       AND (b.meta_departamento = $2 OR (b.meta_departamento IS NULL AND t.departamento = $2))`,
    [anioFiscal, departamento]
  );

  const pim = Number(budgetRows[0]?.pim ?? 0);
  const devengado = Number(budgetRows[0]?.devengado ?? 0);
  const ejecucionPresupuestalPct = pim > 0 ? round2((devengado / pim) * 100) : null;

  const dependencias: DepartmentProxyMetrics["dependencias"] = [
    { app: "radar-ejecucion", ok: true },
  ];

  let avanceFisicoMedioPct: number | null = null;
  let obrasConAvance = 0;

  if (!infobrasPool) {
    dependencias.push({ app: "infobras", ok: false, error: "INFOBRAS_DATABASE_URL no configurada" });
  } else {
    const { rows: obraRows } = await infobrasPool.query<{
      avance: string | null;
      obras: string;
    }>(
      `SELECT AVG(avance_fisico_real_pct)::text AS avance,
              COUNT(*) FILTER (WHERE avance_fisico_real_pct IS NOT NULL)::text AS obras
       FROM public_works
       WHERE departamento = $1`,
      [departamento]
    );
    obrasConAvance = Number(obraRows[0]?.obras ?? 0);
    avanceFisicoMedioPct =
      obraRows[0]?.avance === null ? null : round2(Number(obraRows[0]?.avance));
    dependencias.push({ app: "infobras", ok: obrasConAvance > 0 });
  }

  let restriccion: string | null = PROXY_RESTRICCION;
  let segPp: number | null = null;
  let executionEfficiency: number | null = null;

  if (pim <= 0) {
    restriccion = `${PROXY_RESTRICCION} PIM=0 o sin registros MEF para el departamento.`;
  } else if (avanceFisicoMedioPct === null) {
    restriccion = `${PROXY_RESTRICCION} Sin avance físico INFOBRAS reportado para el departamento.`;
  } else if (ejecucionPresupuestalPct !== null) {
    segPp = round2(ejecucionPresupuestalPct - avanceFisicoMedioPct);
    executionEfficiency =
      ejecucionPresupuestalPct > 0 ? round3(avanceFisicoMedioPct / ejecucionPresupuestalPct) : null;
  }

  return {
    anio: anioFiscal,
    ejecucionPresupuestalPct,
    avanceFisicoMedioPct,
    segPp,
    executionEfficiency,
    pim,
    devengado,
    obrasConAvance,
    restriccion,
    dependencias,
  };
}
