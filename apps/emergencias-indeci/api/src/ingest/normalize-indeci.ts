/**
 * Normaliza filas del CSV `BD_2003-2025_EMERGENCIAS.csv` (INDECI/SINPAD) -- 49 columnas fijas,
 * mismas para todas las 142,139 filas reales (verificado: 100% de las filas tienen exactamente
 * 49 columnas). Los 21 campos de mayor valor (identificación, ubicación, EDAN principal) se
 * normalizan a columnas propias; el resto (detalle de infraestructura educativa/vial/agrícola,
 * pérdidas de ganado) va a `detalleEdan` sin perderse.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

export interface CanonicalEmergencia {
  sinpadId: number | null;
  fechaEmergencia: string | null;
  anio: number | null;
  mes: string | null;
  codDistrito: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  peligro: string | null;
  tipoPeligro: string | null;
  regionNatural: string | null;
  fallecidos: number | null;
  desaparecidos: number | null;
  lesionados: number | null;
  damnificados: number | null;
  afectados: number | null;
  viviendasDestruidas: number | null;
  viviendasAfectadas: number | null;
  pesoAyuda: number | null;
  costoAyuda: number | null;
  detalleEdan: Record<string, unknown> | null;
}

const EXPECTED_COLUMN_COUNT = 49;

/** Nombres de columna reales del CSV, en orden -- usados como llaves de `detalleEdan`. */
const HEADERS = [
  "CODIGO DE EMERGENCIA-SINPAD", "FECHA DE LA EMER", "AÑO", "MES", "COD. DISTRITO", "DPTO.",
  "PROV.", "DIST.", "PELIGRO", "TIPO DE PELIGRO", "REGIÓN NATURAL", "FALLECIDOS", "DESAPARECIDOS",
  "LESIONADOS", "DAMNIFICADOS", "AFECTADOS", "VIVIENDAS DESTRUIDAS", "VIVIENDAS AFECTADAS",
  "CENTROS EDUCATIVOS DESTRUIDOS", "CENTROS EDUCATIVOS AFECTADOS", "SCANT_CCEE", "SAFEC_AULA",
  "AULA_DES+INHA", "SDESTRU_AULA", "SINHAB_AULA", "CENTROS SALUD DESTRUIDOS",
  "CENTROS SALUD AFECTADOS", "HAS CULTIVO DESTRUIDO", "HAS CULTIVO AFECTADO", "PUENTE DESTRUIDO",
  "PUENTE AFECTADO", "CARRETERA DESTRUIDA KM", "CARRETERA AFECTADA KM",
  "CAMINO RURAL DESTRUIDO KM", "CAMINO RURAL AFECTADO KM", "CANAL DE REGADIO COLAPSADO",
  "CANAL DE REGADIO AFECTADO", "PERDIDA VACUNO", "AFECTADOS VACUNO", "PERDIDA CAMELIDO",
  "AFECTADOS CAMELIDO", "PERDIDA CAPRINO", "AFECTADOS CAPRINO", "PERDIDA PORCINO",
  "AFECTADOS PORCINO", "PERDIDA DE ANIMALES MENORES", "AFECTA DE ANIMALES MENORES",
  "PESO DE LA AYUDA", "COSTO DE LA AYUDA",
] as const;

/** Índices 18..46 (0-based) -- todo lo que no tiene columna propia va a detalleEdan. */
const EXTRA_INDICES = Array.from({ length: 46 - 18 + 1 }, (_, i) => i + 18);

function toNullableText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableInt(value: string | undefined): number | null {
  const text = toNullableText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNullableDouble(value: string | undefined): number | null {
  const text = toNullableText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MMDDYY = /^(\d{2})\/(\d{2})\/(\d{2})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * El diccionario de datos de la fuente documenta explícitamente dos formatos posibles:
 * `DD/MM/AAAA` (mayoría, ~89.5% de las filas) y `MM/DD/AA` (año de 2 dígitos, ~10.5% de las
 * filas). Verificado en vivo: los dos formatos son distinguibles sin ambigüedad por la longitud
 * del año (4 dígitos vs. 2), y las 16,401 filas reales en formato `MM/DD/AA` son 100%
 * consistentes con la columna `AÑO` de la misma fila tras expandir el año a `20YY` (0
 * discrepancias) -- todas del año 2025 en los datos verificados.
 */
function toFechaEmergencia(value: string | undefined): string | null {
  const text = toNullableText(value);
  if (!text) return null;

  const ddmmyyyy = DDMMYYYY.exec(text);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    if (isRealDate(Number(yyyy), Number(mm), Number(dd))) return `${yyyy}-${mm}-${dd}`;
    return null;
  }

  const mmddyy = MMDDYY.exec(text);
  if (mmddyy) {
    const [, mm, dd, yy] = mmddyy;
    const yyyy = 2000 + Number(yy);
    if (isRealDate(yyyy, Number(mm), Number(dd))) return `${yyyy}-${mm}-${dd}`;
    return null;
  }

  return null;
}

export function normalizeEmergencias(rows: readonly (readonly string[])[]): {
  rows: CanonicalEmergencia[];
  rejected: RejectedRow[];
} {
  const result: CanonicalEmergencia[] = [];
  const rejected: RejectedRow[] = [];

  for (const cols of rows) {
    if (cols.length !== EXPECTED_COLUMN_COUNT) {
      rejected.push({ raw: cols, reason: `Fila con ${cols.length} columnas, se esperaban ${EXPECTED_COLUMN_COUNT}.` });
      continue;
    }

    const detalleEdan: Record<string, unknown> = {};
    for (const idx of EXTRA_INDICES) {
      const value = toNullableText(cols[idx]);
      if (value !== null) detalleEdan[HEADERS[idx]] = value;
    }

    result.push({
      sinpadId: toNullableInt(cols[0]),
      fechaEmergencia: toFechaEmergencia(cols[1]),
      anio: toNullableInt(cols[2]),
      mes: toNullableText(cols[3]),
      codDistrito: toNullableText(cols[4]),
      departamento: toNullableText(cols[5]),
      provincia: toNullableText(cols[6]),
      distrito: toNullableText(cols[7]),
      peligro: toNullableText(cols[8]),
      tipoPeligro: toNullableText(cols[9]),
      regionNatural: toNullableText(cols[10]),
      fallecidos: toNullableInt(cols[11]),
      desaparecidos: toNullableInt(cols[12]),
      lesionados: toNullableInt(cols[13]),
      damnificados: toNullableInt(cols[14]),
      afectados: toNullableInt(cols[15]),
      viviendasDestruidas: toNullableInt(cols[16]),
      viviendasAfectadas: toNullableInt(cols[17]),
      pesoAyuda: toNullableDouble(cols[47]),
      costoAyuda: toNullableDouble(cols[48]),
      detalleEdan: Object.keys(detalleEdan).length > 0 ? detalleEdan : null,
    });
  }

  return { rows: result, rejected };
}
