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
 * positivo cuenta) porque ADR-0020 decidió no inventar un valor distinto
 * sin evidencia real de la distribución de `costDriftPct` sobre datos ya
 * ingeridos — ver CX-14 (ticket de seguimiento) para ese análisis.
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
