import { ejecucionPool } from "../../db/ejecucion-pool.js";
import { LATEST_BUDGET_CTE } from "./budget-sql.js";
import { round3 } from "./ceplan-national.js";

export const PBA_MAPPING_V1 = [
  {
    dimension: "Salud y nutrición",
    indicadoresCeplan: ["SOC*", "CUMP* (salud)"],
    funcionesMef: ["SALUD"],
    confianza: "Media",
  },
  {
    dimension: "Educación",
    indicadoresCeplan: ["SOC*", "ip_pryedux"],
    funcionesMef: ["EDUCACION"],
    confianza: "Media",
  },
  {
    dimension: "Turismo y cultura",
    indicadoresCeplan: ["ip_pryturx", "PN turismo"],
    funcionesMef: ["TURISMO", "CULTURA"],
    confianza: "Media",
  },
  {
    dimension: "Agro y riego",
    indicadoresCeplan: ["ip_prysecagr", "ECO*"],
    funcionesMef: ["AGROPECUARIA", "PESCA"],
    confianza: "Media",
  },
  {
    dimension: "Ambiente",
    indicadoresCeplan: ["AMB*", "ma_* geo"],
    funcionesMef: ["AMBIENTE"],
    confianza: "Baja",
  },
  {
    dimension: "Infraestructura vial",
    indicadoresCeplan: ["ip_prysectra", "cn_redvial*"],
    funcionesMef: ["TRANSPORTES", "COMUNICACIONES"],
    confianza: "Media",
  },
  {
    dimension: "Seguridad ciudadana",
    indicadoresCeplan: ["ip_pryordpubsegx"],
    funcionesMef: ["SEGURIDAD CIUDADANA", "JUSTICIA"],
    confianza: "Media",
  },
  {
    dimension: "Desarrollo económico",
    indicadoresCeplan: ["ECO*", "INV*"],
    funcionesMef: ["COMERCIO", "PRODUCCION"],
    confianza: "Baja",
  },
  {
    dimension: "Institucional",
    indicadoresCeplan: ["INST*", "PLAN*"],
    funcionesMef: ["GOBIERNO GENERAL", "PLANEAMIENTO"],
    confianza: "Baja",
  },
  {
    dimension: "Vivienda",
    indicadoresCeplan: ["ip_pryvivdesurbx"],
    funcionesMef: ["VIVIENDA", "SANEAMIENTO"],
    confianza: "Media",
  },
] as const;

const PBA_RESTRICCION =
  "Mapeo CEPLAN→MEF heurístico v1; no prueba alineación del PEI regional. Indicadores CEPLAN citados son referencia nacional.";

function normalizeFuncion(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
}

export async function loadPlanBudgetAlignment(departamento: string, anio: number) {
  const { rows } = await ejecucionPool.query<{ funcion: string; devengado: string }>(
    `${LATEST_BUDGET_CTE}
     SELECT UPPER(TRIM(b.funcion)) AS funcion, COALESCE(SUM(b.devengado), 0)::text AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.anio_fiscal = $1
       AND (b.meta_departamento = $2 OR (b.meta_departamento IS NULL AND t.departamento = $2))
     GROUP BY UPPER(TRIM(b.funcion))`,
    [anio, departamento]
  );

  const devengadoByFuncion = new Map(rows.map((row) => [normalizeFuncion(row.funcion), Number(row.devengado)]));
  const totalDevengado = rows.reduce((sum, row) => sum + Number(row.devengado), 0);

  const dimensiones = PBA_MAPPING_V1.map((mapping) => {
    const funcionesNormalizadas = mapping.funcionesMef.map(normalizeFuncion);
    const gastoDevengadoDepartamento = funcionesNormalizadas.reduce(
      (sum, funcion) => sum + (devengadoByFuncion.get(funcion) ?? 0),
      0
    );

    return {
      dimension: mapping.dimension,
      indicadoresCeplan: [...mapping.indicadoresCeplan],
      funcionesMef: [...mapping.funcionesMef],
      confianza: mapping.confianza,
      gastoDevengadoDepartamento: Math.round(gastoDevengadoDepartamento),
      participacionPresupuestoDept:
        totalDevengado > 0 ? round3(gastoDevengadoDepartamento / totalDevengado) : null,
      matcher: "heuristica_dimension_v1",
      restriccion: PBA_RESTRICCION,
    };
  });

  return {
    departamento,
    anio,
    mapeoVersion: "v1" as const,
    gastoDevengadoTotal: Math.round(totalDevengado),
    dimensiones,
    restriccion: PBA_RESTRICCION,
  };
}
