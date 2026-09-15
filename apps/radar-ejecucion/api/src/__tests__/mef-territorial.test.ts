import { describe, expect, it } from 'vitest';
import { coverageRowsFromMefSnapshots } from '../coverage/mef-territorial.js';

describe('coverageRowsFromMefSnapshots (CT-22)', () => {
  it('marks a source as BLOQUEADA when there is no snapshot for it at all', () => {
    const rows = coverageRowsFromMefSnapshots({ departamento: 'AREQUIPA', snapshots: [] });
    expect(rows.every((row) => row.completeness === 'BLOQUEADA')).toBe(true);
    expect(rows.every((row) => row.coverageClaimable === false)).toBe(true);
  });

  it('marks a source COMPLETA_VERIFICADA when its snapshot has persisted rows', () => {
    const rows = coverageRowsFromMefSnapshots({
      departamento: 'LA LIBERTAD',
      snapshots: [
        {
          origenCobertura: 'SEDE_EJECUTORA',
          departamento: 'LA LIBERTAD',
          nivelGobierno: 'GOBIERNOS REGIONALES',
          fechaCorte: '2026-09-03',
          lotes: [24],
          registros: 234,
        },
      ],
    });
    const gr = rows.find((row) => row.sourceName === 'MEF_GR_SEDE_EJECUTORA')!;
    expect(gr.completeness).toBe('COMPLETA_VERIFICADA');
    expect(gr.persistedRecords).toBe(234);
    expect(gr.coverageClaimable).toBe(true);
    expect(gr.restriction).toContain('LA LIBERTAD');

    const gl = rows.find((row) => row.sourceName === 'MEF_GL_SEDE_EJECUTORA')!;
    expect(gl.completeness).toBe('BLOQUEADA');
  });

  it('does not mix up a mixed real case (Arequipa: GR+GL completos, GN sin ingerir)', () => {
    const rows = coverageRowsFromMefSnapshots({
      departamento: 'AREQUIPA',
      snapshots: [
        { origenCobertura: 'SEDE_EJECUTORA', departamento: 'AREQUIPA', nivelGobierno: 'GOBIERNOS REGIONALES', fechaCorte: '2026-09-09', lotes: [43], registros: 196 },
        { origenCobertura: 'SEDE_EJECUTORA', departamento: 'AREQUIPA', nivelGobierno: 'GOBIERNOS LOCALES', fechaCorte: '2026-09-09', lotes: [43], registros: 2737 },
      ],
    });
    expect(rows.find((row) => row.sourceName === 'MEF_GR_SEDE_EJECUTORA')?.completeness).toBe('COMPLETA_VERIFICADA');
    expect(rows.find((row) => row.sourceName === 'MEF_GL_SEDE_EJECUTORA')?.completeness).toBe('COMPLETA_VERIFICADA');
    expect(rows.find((row) => row.sourceName === 'MEF_GN_META_DEPARTAMENTO')?.completeness).toBe('BLOQUEADA');
  });
});
