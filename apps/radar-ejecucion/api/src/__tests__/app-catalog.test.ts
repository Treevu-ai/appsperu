import { describe, expect, it } from 'vitest';
import { TERRITORIAL_APP_CATALOG, summarizeAppCoverage } from '../coverage/app-catalog.js';

describe('territorial app catalog', () => {
  it('declares all ALSOL applications and never treats an unrun app as covered', () => {
    expect(TERRITORIAL_APP_CATALOG).toHaveLength(9);
    expect(summarizeAppCoverage({ app: 'infobras', rows: [] })).toEqual({
      app: 'infobras', state: 'BLOQUEADA', coverage_claimable: false,
    });
  });

  it('keeps CEPLAN explicitly non-territorial until a verified key exists', () => {
    expect(summarizeAppCoverage({ app: 'ceplan-estrategico', rows: [] }).state).toBe('NO_APLICA');
  });
});
