import type { CoverageState } from './states.js';

export const TERRITORIAL_APP_CATALOG = [
  { app: 'radar-ejecucion', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de escaneo MEF verificable fuera de los cortes ya controlados.' },
  { app: 'radar-inversiones', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de rangos continuos del archivo Invierte.pe.' },
  { app: 'infobras', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de corrida persistente del XLSX y su corte.' },
  { app: 'compras-publicas', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de recorrido verificable de OECE/SEACE por fuente.' },
  { app: 'identidad-fiscal', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de padrón y validación de UBIGEO; domicilio no prueba ejecución.' },
  { app: 'proveedores-sancionados', defaultState: 'BLOQUEADA', defaultRestriction: 'Depende del cruce territorial verificable de compras.' },
  { app: 'actividad-agraria', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de serie MIDAGRI validada por departamento, año y mes.' },
  { app: 'salud-institucional', defaultState: 'BLOQUEADA', defaultRestriction: 'Score derivado bloqueado mientras falten capas base verificadas.' },
  { app: 'ceplan-estrategico', defaultState: 'NO_APLICA', defaultRestriction: 'No existe todavía una llave geográfica oficial verificada para declararlo regional.' },
  { app: 'seguridad-ciudadana', defaultState: 'BLOQUEADA', defaultRestriction: 'Pendiente de ingesta SIDPOL (MININTER) validada por departamento, año y mes.' },
] as const satisfies readonly { app: string; defaultState: CoverageState; defaultRestriction: string }[];

export type AppCatalogEntry = typeof TERRITORIAL_APP_CATALOG[number];

export function summarizeAppCoverage(input: {
  app: string;
  rows: Array<{ completeness: CoverageState; coverage_claimable: boolean }>;
}): { app: string; state: CoverageState; coverage_claimable: boolean } {
  if (input.rows.length === 0) {
    const declared = TERRITORIAL_APP_CATALOG.find((entry) => entry.app === input.app);
    return { app: input.app, state: declared?.defaultState ?? 'BLOQUEADA', coverage_claimable: false };
  }
  if (input.rows.every((row) => row.coverage_claimable)) {
    return { app: input.app, state: 'COMPLETA_VERIFICADA', coverage_claimable: true };
  }
  const states = new Set(input.rows.map((row) => row.completeness));
  if (states.has('PARCIAL')) return { app: input.app, state: 'PARCIAL', coverage_claimable: false };
  if (states.has('BLOQUEADA')) return { app: input.app, state: 'BLOQUEADA', coverage_claimable: false };
  if (states.has('SIN_DATOS_EN_FUENTE')) return { app: input.app, state: 'SIN_DATOS_EN_FUENTE', coverage_claimable: false };
  if (states.has('NO_APLICA')) return { app: input.app, state: 'NO_APLICA', coverage_claimable: false };
  return { app: input.app, state: 'BLOQUEADA', coverage_claimable: false };
}
