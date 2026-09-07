/**
 * Cost Drift: cuánto se desvió el costo actualizado respecto al monto
 * viable/aprobado originalmente. null cuando no hay base de comparación
 * (monto viable ausente o cero) — nunca se divide por cero ni se asume 0%.
 *
 * Consolidado desde `apps/infobras/api/src/signals/signals.ts` (CX-10, ver
 * docs/adr/0020-umbral-sobrecosto-unificado.md) — es la misma fórmula que
 * `apps/salud-institucional/api/src/routes/score.ts` necesita para decidir
 * si una inversión "tiene sobrecosto", aunque esa app hoy calcula la
 * comparación directo en SQL (`costo_actualizado > monto_viable`) por
 * razones de performance, no fila por fila en JS — ver `SOBRECOSTO_UMBRAL_PCT`
 * abajo para el vínculo explícito entre ambas.
 */
export function costDriftPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable === 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 10000) / 100;
}

/**
 * Umbral de "% de desvío que cuenta como sobrecosto", compartido entre
 * `infobras` y `salud-institucional`. Se mantiene en 0 (cualquier desvío
 * positivo cuenta) — CX-14 (ver ADR-0020, actualización 2026-09-07) analizó
 * la distribución real de `costDriftPct` sobre las 7,985 inversiones de
 * `radar-inversiones` (Invierte.pe, La Libertad) con base de comparación
 * válida: mediana exactamente 0%, p75 13.6%, p90 60.7% — con el usuario
 * decidiendo mantener 0 en vista de que subirlo no filtra ruido de forma
 * significativa (~130 de 3,124 casos positivos caen en la banda 0%-1%),
 * solo excluiría sobrecostos reales aunque pequeños. Ya no es una postura
 * conservadora sin evidencia — la evidencia real la confirma como
 * defendible.
 *
 * Si este valor cambia, la comparación SQL de
 * `salud-institucional/routes/score.ts` (`costo_actualizado > monto_viable`)
 * debe actualizarse en el mismo cambio a
 * `costo_actualizado > monto_viable * (1 + SOBRECOSTO_UMBRAL_PCT / 100)` —
 * no se sincroniza automáticamente porque esa app no calcula el % fila por
 * fila (evita traer todas las inversiones para calcular en memoria).
 */
export const SOBRECOSTO_UMBRAL_PCT = 0;

/** Clasifica un `costDriftPct` ya calculado contra `SOBRECOSTO_UMBRAL_PCT`. */
export function esSobrecosto(driftPct: number | null, umbral: number = SOBRECOSTO_UMBRAL_PCT): boolean {
  return driftPct !== null && driftPct > umbral;
}
