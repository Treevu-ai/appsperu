import { COL } from "./columns.js";

/**
 * Los campos numéricos del dataset real usan un espacio en vez de punto/coma
 * decimal: "1205287 56" significa 1,205,287.56 (confirmado en vivo contra el
 * archivo real, ver docs/data-contracts/infobras-obras-publicas.md). También
 * aparecen como enteros simples sin espacio ("2740900"). Cualquier otro
 * patrón se rechaza en vez de adivinar — nunca forzar un parseo.
 */
export function parseSpaceDecimalNumber(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (/^\d+$/.test(value)) return Number(value);

  const match = value.match(/^(\d+) (\d{1,2})$/);
  if (match) {
    return Number(`${match[1]}.${match[2]}`);
  }

  return null;
}

export function parseSiNoBoolean(raw: string | undefined): boolean {
  return (raw ?? "").trim().toUpperCase() === "SI";
}

export function parseIntOrNull(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "" || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function cell(row: string[], index: number): string | undefined {
  return row[index];
}

function requiredText(row: string[], index: number): string | null {
  const value = cell(row, index)?.trim();
  return value ? value : null;
}

export interface CanonicalPublicWorkRow {
  codigoInfobras: string;
  codigoEntidad: string;
  entidadNombre: string;
  nombreObra: string;
  modalidadEjecucion: string | null;
  naturalezaObra: string | null;
  estadoEjecucion: string | null;
  nivelGobierno: string | null;
  sectorEntidad: string | null;
  cui: string | null;
  codigoSnip: string | null;
  nombreInversion: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  costoExpedienteTecnico: number | null;
  avanceFisicoProgPct: number | null;
  avanceFisicoRealPct: number | null;
  valorizacionProg: number | null;
  valorizacionEjecutada: number | null;
  ejecucionFinancieraPct: number | null;
  existeParalizacion: boolean;
  causalParalizacion: string | null;
  fechaParalizacion: string | null;
  diasParalizado: number | null;
  montoDevengadoTotal: number | null;
}

export interface RejectedPublicWork {
  raw: string[];
  reason: string;
}

export interface NormalizeResult {
  rows: CanonicalPublicWorkRow[];
  rejected: RejectedPublicWork[];
}

function optionalText(row: string[], index: number): string | null {
  return cell(row, index)?.trim() || null;
}

function optionalDate(row: string[], index: number): string | null {
  const value = cell(row, index)?.trim();
  if (!value) return null;
  // El dataset usa DD/MM/YYYY; Postgres necesita YYYY-MM-DD.
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Normaliza filas crudas del sheet de INFOBRAS a filas canónicas. Rechaza
 * (no adivina) cuando faltan los identificadores mínimos o un campo
 * numérico no calza con ninguno de los formatos observados.
 */
export function normalizeInfobrasRows(rows: string[][]): NormalizeResult {
  const result: CanonicalPublicWorkRow[] = [];
  const rejected: RejectedPublicWork[] = [];

  for (const row of rows) {
    const codigoInfobras = requiredText(row, COL.codigoInfobras);
    const codigoEntidad = requiredText(row, COL.codigoEntidad);
    const entidadNombre = requiredText(row, COL.entidadNombre);
    const nombreObra = requiredText(row, COL.nombreObra);
    const departamento = requiredText(row, COL.departamento);

    if (!codigoInfobras || !codigoEntidad || !entidadNombre || !nombreObra || !departamento) {
      rejected.push({ raw: row, reason: "faltan campos requeridos (identificación o departamento)" });
      continue;
    }

    const montoViable = parseSpaceDecimalNumber(cell(row, COL.montoViable));
    const costoActualizado = parseSpaceDecimalNumber(cell(row, COL.costoActualizado));
    const costoExpedienteTecnico = parseSpaceDecimalNumber(cell(row, COL.costoExpedienteTecnico));
    const avanceFisicoProgPct = parseSpaceDecimalNumber(cell(row, COL.avanceFisicoProgPct));
    const avanceFisicoRealPct = parseSpaceDecimalNumber(cell(row, COL.avanceFisicoRealPct));
    const valorizacionProg = parseSpaceDecimalNumber(cell(row, COL.valorizacionProg));
    const valorizacionEjecutada = parseSpaceDecimalNumber(cell(row, COL.valorizacionEjecutada));
    const ejecucionFinancieraPct = parseSpaceDecimalNumber(cell(row, COL.ejecucionFinancieraPct));
    const montoDevengadoTotal = parseSpaceDecimalNumber(cell(row, COL.montoDevengadoTotal));

    const numericFields: Record<string, string | undefined> = {
      "Monto Viable/Aprobado": cell(row, COL.montoViable),
      "Costo Actualizado de la inversión": cell(row, COL.costoActualizado),
      "Costo de obra según Expediente técnico": cell(row, COL.costoExpedienteTecnico),
      "Avance Físico Programado Acumulado (%)": cell(row, COL.avanceFisicoProgPct),
      "Avance Físico Real Acumulado (%)": cell(row, COL.avanceFisicoRealPct),
      "Monto de valorización Programado Acumulado": cell(row, COL.valorizacionProg),
      "Monto de valorización Ejecutado Acumulado": cell(row, COL.valorizacionEjecutada),
      "Porcentaje de ejecución financiera": cell(row, COL.ejecucionFinancieraPct),
      "Monto Total devengado del proyecto": cell(row, COL.montoDevengadoTotal),
    };
    const unparseable = Object.entries(numericFields).find(
      ([, raw]) => (raw ?? "").trim() !== "" && parseSpaceDecimalNumber(raw) === null
    );
    if (unparseable) {
      rejected.push({ raw: row, reason: `campo numérico con formato inesperado: ${unparseable[0]}` });
      continue;
    }

    result.push({
      codigoInfobras,
      codigoEntidad,
      entidadNombre,
      nombreObra,
      modalidadEjecucion: optionalText(row, COL.modalidadEjecucion),
      naturalezaObra: optionalText(row, COL.naturalezaObra),
      estadoEjecucion: optionalText(row, COL.estadoEjecucion),
      nivelGobierno: optionalText(row, COL.nivelGobierno),
      sectorEntidad: optionalText(row, COL.sectorEntidad),
      cui: optionalText(row, COL.cui),
      codigoSnip: optionalText(row, COL.codigoSnip),
      nombreInversion: optionalText(row, COL.nombreInversion),
      montoViable,
      costoActualizado,
      departamento,
      provincia: optionalText(row, COL.provincia),
      distrito: optionalText(row, COL.distrito),
      costoExpedienteTecnico,
      avanceFisicoProgPct,
      avanceFisicoRealPct,
      valorizacionProg,
      valorizacionEjecutada,
      ejecucionFinancieraPct,
      existeParalizacion: parseSiNoBoolean(cell(row, COL.existeParalizacion)),
      causalParalizacion: optionalText(row, COL.causalParalizacion),
      fechaParalizacion: optionalDate(row, COL.fechaParalizacion),
      diasParalizado: parseIntOrNull(cell(row, COL.diasParalizado)),
      montoDevengadoTotal,
    });
  }

  return { rows: result, rejected };
}
