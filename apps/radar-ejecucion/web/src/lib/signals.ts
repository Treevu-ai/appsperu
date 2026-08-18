/**
 * Umbral de señal tomado literalmente de la metodología del documento fuente
 * (sección 7, "Ejemplos de señales defendibles"): un percentil de ejecución
 * por debajo de 10 dentro de un grupo comparable con n suficiente. No es un
 * umbral inventado para esta UI — es el único ejemplo de señal que el propio
 * documento considera defendible sobre datos de ejecución/benchmark.
 */
export const PERCENTILE_REVIEW_THRESHOLD = 10;

export function isBelowReviewThreshold(percentil: number): boolean {
  return percentil < PERCENTILE_REVIEW_THRESHOLD;
}
