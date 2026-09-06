/**
 * Dos datasets con esquemas distintos, ambos agregados (sin identificador
 * individual), confirmados en vivo el 2026-09-06. Cada función normaliza
 * uno, aislando filas inválidas en `rejected` en vez de lanzar.
 */

function toText(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

// --- CEM (Centro Emergencia Mujer) --------------------------------------

export interface CanonicalCemCaso {
  anioReporte: number;
  periodo: string | null;
  codigoCentroAtencion: string;
  nombreCentroAtencion: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  casosTotal: number | null;
  casosHombres: number | null;
  casosMujeres: number | null;
  casosViolenciaPsicologica: number | null;
  casosViolenciaFisica: number | null;
  casosViolenciaSexual: number | null;
  casosViolenciaEconomica: number | null;
}

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

export interface NormalizeCemResult {
  rows: CanonicalCemCaso[];
  rejected: RejectedRow[];
}

export function normalizeCemCasos(rawRows: Record<string, unknown>[]): NormalizeCemResult {
  const rows: CanonicalCemCaso[] = [];
  const rejected: RejectedRow[] = [];
  const seenKey = new Set<string>();

  for (const raw of rawRows) {
    const anioReporte = toInt(raw["AÑO"]);
    const codigoCentroAtencion = toText(raw["CODIGO CENTRO ATENCION"]);

    if (anioReporte === null) {
      rejected.push({ raw, reason: "AÑO ausente o no numérico" });
      continue;
    }
    if (!codigoCentroAtencion) {
      rejected.push({ raw, reason: "CODIGO CENTRO ATENCION ausente" });
      continue;
    }

    const key = `${anioReporte}::${codigoCentroAtencion}`;
    if (seenKey.has(key)) {
      rejected.push({ raw, reason: `fila duplicada dentro del mismo lote: ${key}` });
      continue;
    }
    seenKey.add(key);

    rows.push({
      anioReporte,
      periodo: toText(raw["PERIODO"]),
      codigoCentroAtencion,
      nombreCentroAtencion: toText(raw["NOMBRE CENTRO ATENCION"]),
      ubigeo: toText(raw["UBIGEO"]),
      departamento: toText(raw["DEPARTAMENTO"]),
      provincia: toText(raw["PROVINCIA"]),
      distrito: toText(raw["DISTRITO"]),
      casosTotal: toInt(raw["N° CASOS ATENDIDOS-TOTAL"]),
      casosHombres: toInt(raw["N° CASOS ATENDIDOS - HOMBRES - TOTAL"]),
      casosMujeres: toInt(raw["N° CASOS ATENDIDOS - MUJERES - TOTAL"]),
      casosViolenciaPsicologica: toInt(raw["N° CASOS ATENDIDOS - VIOLENCIA PSICOLOGICA"]),
      casosViolenciaFisica: toInt(raw["N° CASOS ATENDIDOS - VIOLENCIA FISICA"]),
      casosViolenciaSexual: toInt(raw["N° CASOS ATENDIDOS - VIOLENCIA SEXUAL"]),
      casosViolenciaEconomica: toInt(raw["N° CASOS ATENDIDOS - VIOLENCIA ECONÓMICA O PATRIMONIAL"]),
    });
  }

  return { rows, rejected };
}

// --- Chat 100 ------------------------------------------------------------

export interface CanonicalChat100Consulta {
  anioReporte: number;
  periodo: string | null;
  consultasTotal: number | null;
  consultasHombres: number | null;
  consultasMujeres: number | null;
  consultasNoEspecificaSexo: number | null;
}

export interface NormalizeChat100Result {
  rows: CanonicalChat100Consulta[];
  rejected: RejectedRow[];
}

export function normalizeChat100Consultas(rawRows: Record<string, unknown>[]): NormalizeChat100Result {
  const rows: CanonicalChat100Consulta[] = [];
  const rejected: RejectedRow[] = [];
  const seenAnio = new Set<number>();

  for (const raw of rawRows) {
    const anioReporte = toInt(raw["AÑO DEL REPORTE DE INFORMACION"]);

    if (anioReporte === null) {
      rejected.push({ raw, reason: "AÑO DEL REPORTE DE INFORMACION ausente o no numérico" });
      continue;
    }
    if (seenAnio.has(anioReporte)) {
      rejected.push({ raw, reason: `año duplicado dentro del mismo lote: ${anioReporte}` });
      continue;
    }
    seenAnio.add(anioReporte);

    rows.push({
      anioReporte,
      periodo: toText(raw["PERIODO DE LA INFORMACION REMITIDA"]),
      consultasTotal: toInt(raw["N° DE CONSULTAS -TOTAL"]),
      consultasHombres: toInt(raw["N° DE CONSULTAS - HOMBRES - TOTAL"]),
      consultasMujeres: toInt(raw["N° DE CONSULTAS - MUJERES - TOTAL"]),
      consultasNoEspecificaSexo: toInt(raw["N° DE CONSULTAS - NO ESPECIFICA SEXO - TOTAL"]),
    });
  }

  return { rows, rejected };
}
