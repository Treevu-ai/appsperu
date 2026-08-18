/**
 * Índices de columna confirmados en vivo (2026-08-16) contra el dataset real
 * "Obras Públicas" de INFOBRAS (ver docs/data-contracts/infobras-obras-publicas.md).
 * El sheet no trae encabezados accesibles por nombre en un formato estable
 * entre descargas (celdas inline, sin sharedStrings) — se mapea por índice,
 * verificado contra una fila real de muestra.
 */
export const COL = {
  codigoEntidad: 0,
  entidadNombre: 1,
  codigoInfobras: 2,
  nombreObra: 3,
  modalidadEjecucion: 4,
  naturalezaObra: 7,
  estadoEjecucion: 11,
  nivelGobierno: 19,
  sectorEntidad: 20,
  cui: 21,
  codigoSnip: 22,
  nombreInversion: 23,
  montoViable: 26,
  costoActualizado: 27,
  departamento: 29,
  provincia: 30,
  distrito: 31,
  costoExpedienteTecnico: 35,
  avanceFisicoProgPct: 61,
  avanceFisicoRealPct: 62,
  valorizacionProg: 63,
  valorizacionEjecutada: 64,
  ejecucionFinancieraPct: 65,
  existeParalizacion: 67,
  causalParalizacion: 68,
  fechaParalizacion: 69,
  diasParalizado: 70,
  montoDevengadoTotal: 96,
} as const;

export const TITLE_ROWS = 3;
export const HEADER_ROWS = 1;
export const DATA_START_ROW = TITLE_ROWS + HEADER_ROWS + 1; // ExcelJS rows are 1-indexed
