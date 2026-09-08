/**
 * Score de salud institucional — combina 5 señales ya cruzadas y probadas en
 * vivo en las otras apps del proyecto (ver docs/data-contracts/
 * salud-institucional-score.md). Cada componente es independiente: si una
 * fuente no tiene dato para una entidad (ej. sin obras registradas en
 * INFOBRAS), ese componente se omite del promedio — nunca se asume 0 ni 100.
 * Promedio simple entre componentes disponibles, no ponderado — una entidad
 * con menos fuentes disponibles no queda en desventaja automática, pero su
 * score trae explícito cuántos componentes lo sostienen (`componentesUsados`).
 */

export interface EjecucionInput {
  pim: number;
  devengado: number;
}

export interface ObrasInput {
  total: number;
  paralizadas: number;
}

export interface InversionesInput {
  total: number;
  conSobrecosto: number;
}

export interface ComprasInput {
  totalAdjudicado: number;
  maxProveedorAdjudicado: number;
}

export interface FiscalInput {
  evaluables: number;
  regulares: number;
}

export interface EntityScoreInputs {
  entityCode: string;
  nombre: string;
  /** Nivel de gobierno, provincia y distrito de la entidad (derivados de
   * `entities.ubigeo` -> `territories` en la capa de rutas) — pass-through,
   * no se calculan acá. `null` explícito si `ubigeo` no resuelve; nunca se
   * infiere un valor. */
  nivelGobierno: string | null;
  provincia: string | null;
  distrito: string | null;
  ejecucion: EjecucionInput | null;
  obras: ObrasInput | null;
  inversiones: InversionesInput | null;
  compras: ComprasInput | null;
  fiscal: FiscalInput | null;
}

export interface ComponentScore {
  valor: number | null;
  disponible: boolean;
}

export interface EntityScore {
  entityCode: string;
  nombre: string;
  nivelGobierno: string | null;
  provincia: string | null;
  distrito: string | null;
  scoreCompuesto: number | null;
  /** Clasificación cualitativa de scoreCompuesto (SI-04) — null explícito
   * cuando scoreCompuesto es null, nunca una banda por defecto. */
  banda: Banda | null;
  componentesUsados: number;
  componentes: {
    ejecucion: ComponentScore;
    obrasNoParalizadas: ComponentScore;
    inversionesSinSobrecosto: ComponentScore;
    comprasNoConcentradas: ComponentScore;
    saludTributariaProveedores: ComponentScore;
  };
  /** Posición dentro de las entidades de su mismo nivel de gobierno con score
   * disponible (ej. "3° de 85 Gobiernos Locales") — se calcula en score.ts
   * sobre el conjunto completo de resultados, no acá; queda `null` hasta que
   * score.ts lo rellena, y se mantiene `null` si la entidad no tiene score. */
  rankingEnNivelGobierno: { posicion: number; total: number } | null;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

export type Banda = "Sobresaliente" | "Alto" | "Medio" | "Bajo" | "Crítico";

/**
 * Umbrales de banda (SI-04) — 5 bandas con cola crítica, esquema confirmado
 * por el usuario el 2026-09-07 sobre los percentiles reales de
 * scoreCompuesto en las 129 entidades de La Libertad con score no nulo en
 * esa fecha: mínimo 27.9, p10 45.9, p25 55.8, mediana 61.3, p75 67.9,
 * p90 72.3, máximo 80.3, promedio 60.7.
 *
 * Re-verificado el 2026-09-08 tras SI-08 (fix de PIM=0 que cambió el score
 * de 3 entidades de forma significativa, incl. Trujillo MPT 64.2 -> 80.2):
 * la distribución completa de las 129 entidades apenas se movió
 * (p10 46.1, p25 55.9, mediana 61.7, p75 68.8, p90 72.8, min/max iguales,
 * promedio 61.1 — todos los percentiles cambiaron menos de 1 punto) porque
 * solo 3 de 129 entidades se vieron afectadas. No se recalculan los
 * umbrales confirmados por ese cambio — la distribución no cambió lo
 * suficiente como para justificarlo (ver criterio de mantenimiento en
 * docs/TICKETS_Score_Institucional_Granular_v1.md, SI-04).
 *
 * NO se recalculan automáticamente si la distribución cambia en el futuro
 * (ej. tras automatizar el crossref o agregar más departamentos) — eso
 * requiere una decisión explícita, no una asunción de que estos siguen
 * siendo representativos para siempre.
 */
const BANDA_THRESHOLDS: ReadonlyArray<{ min: number; banda: Banda }> = [
  { min: 72.3, banda: "Sobresaliente" }, // p90
  { min: 67.9, banda: "Alto" }, // p75
  { min: 55.8, banda: "Medio" }, // p25
  { min: 45.9, banda: "Bajo" }, // p10
  { min: -Infinity, banda: "Crítico" },
];

function bandaDe(scoreCompuesto: number | null): Banda | null {
  if (scoreCompuesto === null) return null;
  for (const { min, banda } of BANDA_THRESHOLDS) {
    if (scoreCompuesto >= min) return banda;
  }
  return "Crítico"; // inalcanzable (el último umbral es -Infinity), solo para el chequeo de tipos
}

export function computeEntityScore(input: EntityScoreInputs): EntityScore {
  // PIM=0 (a diferencia de PIM=null) significa que la entidad SÍ tiene fila de
  // ejecución, pero sin presupuesto modificado registrado en la fuente — un
  // vacío de dato, no un 0% de avance real. pct() ya devuelve null cuando el
  // denominador es <=0; antes de este fix, `?? 0` convertía ese null en un 0
  // literal marcado como `disponible: true`, violando la regla del propio
  // archivo de nunca imputar 0 ni 100 por ausencia de dato (SI-08, hallazgo
  // 2026-09-08 — ver docs/TICKETS_Score_Institucional_Granular_v1.md).
  const ejecucionScore: ComponentScore =
    input.ejecucion && input.ejecucion.pim > 0
      ? { valor: Math.min(100, pct(input.ejecucion.devengado, input.ejecucion.pim) ?? 0), disponible: true }
      : { valor: null, disponible: false };

  const obrasScore: ComponentScore = input.obras
    ? { valor: pct(input.obras.total - input.obras.paralizadas, input.obras.total), disponible: true }
    : { valor: null, disponible: false };

  const inversionesScore: ComponentScore = input.inversiones
    ? {
        valor: pct(input.inversiones.total - input.inversiones.conSobrecosto, input.inversiones.total),
        disponible: true,
      }
    : { valor: null, disponible: false };

  const comprasScore: ComponentScore = input.compras
    ? {
        valor: pct(
          input.compras.totalAdjudicado - input.compras.maxProveedorAdjudicado,
          input.compras.totalAdjudicado
        ),
        disponible: true,
      }
    : { valor: null, disponible: false };

  const fiscalScore: ComponentScore = input.fiscal
    ? { valor: pct(input.fiscal.regulares, input.fiscal.evaluables), disponible: true }
    : { valor: null, disponible: false };

  const componentes = {
    ejecucion: ejecucionScore,
    obrasNoParalizadas: obrasScore,
    inversionesSinSobrecosto: inversionesScore,
    comprasNoConcentradas: comprasScore,
    saludTributariaProveedores: fiscalScore,
  };

  const disponibles = Object.values(componentes).filter(
    (c): c is ComponentScore & { valor: number } => c.valor !== null
  );

  const scoreCompuesto =
    disponibles.length === 0
      ? null
      : Math.round((disponibles.reduce((sum, c) => sum + c.valor, 0) / disponibles.length) * 10) / 10;

  return {
    entityCode: input.entityCode,
    nombre: input.nombre,
    nivelGobierno: input.nivelGobierno,
    provincia: input.provincia,
    distrito: input.distrito,
    scoreCompuesto,
    banda: bandaDe(scoreCompuesto),
    componentesUsados: disponibles.length,
    componentes,
    rankingEnNivelGobierno: null,
  };
}
