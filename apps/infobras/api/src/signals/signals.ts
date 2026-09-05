/**
 * Re-exportada desde `@appsperu/shared-signals` (CX-10, ver
 * docs/adr/0020-umbral-sobrecosto-unificado.md) — este archivo era su única
 * definición hasta que se compartió con salud-institucional.
 */
export { costDriftPct } from "@appsperu/shared-signals";

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
