/**
 * Tres datasets con esquemas distintos (dos XLSX, un CSV), confirmados en
 * vivo el 2026-09-06. Cada función normaliza uno, aislando filas inválidas
 * en `rejected` en vez de lanzar.
 */

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/** ExcelJS entrega fechas como `Date` nativo; el CSV las traería como texto. */
function toDateOnly(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = toText(value);
  if (!text) return null;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

// --- Offset agreements ------------------------------------------------

export interface CanonicalOffsetAgreement {
  tipoConvenio: string;
  institucion: string;
  titulo: string;
  entidadContraparte: string | null;
  observacion: string | null;
  anioInicio: number | null;
}

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

export interface NormalizeOffsetResult {
  rows: CanonicalOffsetAgreement[];
  rejected: RejectedRow[];
}

export function normalizeOffsetAgreements(rawRows: Record<string, unknown>[]): NormalizeOffsetResult {
  const rows: CanonicalOffsetAgreement[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const tipoConvenio = toText(raw["TIPO DE CONVENIO"]);
    const institucion = toText(raw["INSTITUCION"]);
    const titulo = toText(raw["TITULO"]);

    if (!tipoConvenio) {
      rejected.push({ raw, reason: "TIPO DE CONVENIO ausente" });
      continue;
    }
    if (!institucion) {
      rejected.push({ raw, reason: "INSTITUCION ausente" });
      continue;
    }
    if (!titulo) {
      rejected.push({ raw, reason: "TITULO ausente" });
      continue;
    }

    rows.push({
      tipoConvenio,
      institucion,
      titulo,
      entidadContraparte: toText(raw["ENTIDAD CONTRAPARTE"]),
      observacion: toText(raw["OBSERVACION"]),
      anioInicio: toInt(raw["AÑO INICIO"]),
    });
  }

  return { rows, rejected };
}

// --- Training abroad ----------------------------------------------------

export interface CanonicalTrainingAbroad {
  institucion: string;
  capacitacion: string;
  personalCantidad: number;
  fechaInicio: string | null;
  fechaTermino: string | null;
  pais: string | null;
}

export interface NormalizeTrainingAbroadResult {
  rows: CanonicalTrainingAbroad[];
  rejected: RejectedRow[];
}

export function normalizeTrainingAbroad(rawRows: Record<string, unknown>[]): NormalizeTrainingAbroadResult {
  const rows: CanonicalTrainingAbroad[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const institucion = toText(raw["INSTITUCIÓN"]);
    const capacitacion = toText(raw["CAPACITACIÓN"]);
    const personalCantidad = toInt(raw["PERSONAL MILITAR O CIVIL"]);

    if (!institucion) {
      rejected.push({ raw, reason: "INSTITUCIÓN ausente" });
      continue;
    }
    if (!capacitacion) {
      rejected.push({ raw, reason: "CAPACITACIÓN ausente" });
      continue;
    }
    if (personalCantidad === null) {
      rejected.push({ raw, reason: "PERSONAL MILITAR O CIVIL ausente o no numérico" });
      continue;
    }

    rows.push({
      institucion,
      capacitacion,
      personalCantidad,
      fechaInicio: toDateOnly(raw["INICIO"]),
      fechaTermino: toDateOnly(raw["TERMINO"]),
      pais: toText(raw["PAÍS"]),
    });
  }

  return { rows, rejected };
}

// --- Peace missions -------------------------------------------------------

export interface CanonicalPeaceMission {
  mision: string;
  modalidad: string | null;
  institucion: string;
  pais: string | null;
  anio: number;
  cantidad: number;
}

export interface NormalizePeaceMissionsResult {
  rows: CanonicalPeaceMission[];
  rejected: RejectedRow[];
}

export function normalizePeaceMissions(rawRows: Record<string, unknown>[]): NormalizePeaceMissionsResult {
  const rows: CanonicalPeaceMission[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const mision = toText(raw["MISION"]);
    const institucion = toText(raw["INSTITUCION"]);
    const anio = toInt(raw["AÑO"]);
    const cantidad = toInt(raw["CANTIDAD"]);

    if (!mision) {
      rejected.push({ raw, reason: "MISION ausente" });
      continue;
    }
    if (!institucion) {
      rejected.push({ raw, reason: "INSTITUCION ausente" });
      continue;
    }
    if (anio === null) {
      rejected.push({ raw, reason: "AÑO ausente o no numérico" });
      continue;
    }
    if (cantidad === null) {
      rejected.push({ raw, reason: "CANTIDAD ausente o no numérica" });
      continue;
    }

    rows.push({
      mision,
      modalidad: toText(raw["MODALIDAD"]),
      institucion,
      pais: toText(raw["PAIS"]),
      anio,
      cantidad,
    });
  }

  return { rows, rejected };
}
