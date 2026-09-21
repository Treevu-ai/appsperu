/**
 * Normaliza filas del listado detallado de casos reportados a SíseVe (MINEDU).
 *
 * Sin PII: la fuente no trae nombres, DNI ni identificador de alumno o institución educativa
 * individual -- la granularidad más fina es UGEL. No hay nada que excluir del objeto crudo.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** La fuente trae `FECHA_REPORTE` como fecha nativa de Excel (Date de JS vía exceljs) o texto ISO. */
function toDateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = toText(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface CanonicalCaso {
  fechaReporte: string;
  dre: string;
  ugel: string;
  nivelEducativo: string | null;
  tipoReporte: string;
  tipoViolencia: string;
  subtipoViolencia: string | null;
  tipoEstadoReporte: string | null;
}

export interface NormalizeCasosResult {
  rows: CanonicalCaso[];
  rejected: RejectedRow[];
}

export function normalizeCasos(rawRows: Record<string, unknown>[]): NormalizeCasosResult {
  const rows: CanonicalCaso[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const fechaReporte = toDateOnly(raw["FECHA_REPORTE"]);
    const dre = toText(raw["DRE"]);
    const ugel = toText(raw["UGEL"]);
    const tipoReporte = toText(raw["TIPO_REPORTE"]);
    const tipoViolencia = toText(raw["TIPO_VIOLENCIA"]);

    if (!fechaReporte) {
      rejected.push({ raw, reason: "FECHA_REPORTE ausente o inválida" });
      continue;
    }
    if (!dre) {
      rejected.push({ raw, reason: "DRE ausente" });
      continue;
    }
    if (!ugel) {
      rejected.push({ raw, reason: "UGEL ausente" });
      continue;
    }
    if (!tipoReporte) {
      rejected.push({ raw, reason: "TIPO_REPORTE ausente" });
      continue;
    }
    if (!tipoViolencia) {
      rejected.push({ raw, reason: "TIPO_VIOLENCIA ausente" });
      continue;
    }

    rows.push({
      fechaReporte,
      dre,
      ugel,
      nivelEducativo: toText(raw["NIVEL_EDUCATIVO"]),
      tipoReporte,
      tipoViolencia,
      subtipoViolencia: toText(raw["SUBTIPO_VIOLENCIA"]),
      tipoEstadoReporte: toText(raw["TIPO_ESTADO_REPORTE"]),
    });
  }

  return { rows, rejected };
}
