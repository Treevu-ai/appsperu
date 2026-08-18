/**
 * Cost Drift: cuánto se desvió el costo actualizado respecto al monto
 * viable/aprobado originalmente. null cuando no hay base de comparación
 * (monto viable ausente o cero) — nunca se divide por cero ni se asume 0%.
 */
export function costDriftPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable === 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 10000) / 100;
}

/**
 * Gap físico-financiero: diferencia entre avance físico real y ejecución
 * financiera reportados por la entidad. Un valor positivo grande indica que
 * la obra avanza más rápido físicamente que lo que se ha pagado (o
 * viceversa si es negativo) — una señal, no una conclusión.
 */
export function gapFisicoFinanciero(
  avanceFisicoRealPct: number | null,
  ejecucionFinancieraPct: number | null
): number | null {
  if (avanceFisicoRealPct === null || ejecucionFinancieraPct === null) return null;
  return Math.round((avanceFisicoRealPct - ejecucionFinancieraPct) * 100) / 100;
}
