import { describe, expect, it } from 'vitest';
import { canClaimCoverage } from '../coverage/states.js';

describe('territorial coverage claims', () => {
  it('does not turn zero rows or a partial run into verified coverage', () => {
    expect(canClaimCoverage({ state: 'PARCIAL', batch: 'batch-1', cutoff: '2026-08-24T00:00:00Z', persisted: 0 })).toBe(false);
    expect(canClaimCoverage({ state: 'SIN_DATOS_EN_FUENTE', batch: 'batch-1', cutoff: '2026-08-24T00:00:00Z', persisted: 0 })).toBe(false);
  });

  it('requires state, batch, cutoff and a persisted count', () => {
    expect(canClaimCoverage({ state: 'COMPLETA_VERIFICADA', batch: 'batch-1', cutoff: '2026-08-24T00:00:00Z', persisted: 0 })).toBe(true);
    expect(canClaimCoverage({ state: 'COMPLETA_VERIFICADA', batch: null, cutoff: '2026-08-24T00:00:00Z', persisted: 2 })).toBe(false);
  });
});
