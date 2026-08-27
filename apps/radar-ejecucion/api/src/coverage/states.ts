export const COVERAGE_STATES = ['COMPLETA_VERIFICADA','PARCIAL','SIN_DATOS_EN_FUENTE','BLOQUEADA','NO_APLICA'] as const;
export type CoverageState = typeof COVERAGE_STATES[number];

export function canClaimCoverage(input: { state: CoverageState; batch: string | null; cutoff: string | null; persisted: number | null }): boolean {
  return input.state === 'COMPLETA_VERIFICADA' && Boolean(input.batch) && Boolean(input.cutoff) && input.persisted !== null;
}
