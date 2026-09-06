/**
 * Normaliza filas del recurso "actual" de Autoridades Electas JNE (esquema con
 * prefijos TX, NU, FE en las columnas, sin documento de identidad — ver el comentario de alcance en
 * `db/migrations/001_init.sql`). El recurso histórico con DNI (esquema sin
 * prefijo `TX`) queda deliberadamente fuera de este normalizador.
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

function toInt(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** SheetJS (`cellDates: true`) entrega fechas como `Date` nativo o ISO string. */
function toDateOnly(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toTimestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const AMBITOS = new Set(["NACIONAL", "REGIONAL", "PROVINCIAL", "DISTRITAL"]);
const GENEROS = new Set(["M", "F"]);

export interface CanonicalAutoridad {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  organizacionPolitica: string;
  posicion: number | null;
  cargo: string;
  region: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  fechaInicioVigencia: string | null;
  fechaFinVigencia: string | null;
  procesoElectoral: string;
  anioEleccion: number | null;
  pronunciamiento: string | null;
  fechaPublicacion: string | null;
  ambito: string | null;
  genero: string | null;
  edad: number | null;
  periodo: string | null;
  tipoOrganizacion: string | null;
}

export interface NormalizeAutoridadesResult {
  rows: CanonicalAutoridad[];
  rejected: RejectedRow[];
}

export function normalizeAutoridadesElectas(rawRows: Record<string, unknown>[]): NormalizeAutoridadesResult {
  const rows: CanonicalAutoridad[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const nombres = toText(raw["TXNOMBRES"]);
    const apellidoPaterno = toText(raw["TXAPELLIDOPATERNO"]);
    const organizacionPolitica = toText(raw["TXORGANIZACIONPOLITICA"]);
    const cargo = toText(raw["TXCARGO"]);
    const procesoElectoral = toText(raw["TXPROCESOELECTORAL"]);

    if (!nombres) {
      rejected.push({ raw, reason: "TXNOMBRES ausente" });
      continue;
    }
    if (!apellidoPaterno) {
      rejected.push({ raw, reason: "TXAPELLIDOPATERNO ausente" });
      continue;
    }
    if (!organizacionPolitica) {
      rejected.push({ raw, reason: "TXORGANIZACIONPOLITICA ausente" });
      continue;
    }
    if (!cargo) {
      rejected.push({ raw, reason: "TXCARGO ausente" });
      continue;
    }
    if (!procesoElectoral) {
      rejected.push({ raw, reason: "TXPROCESOELECTORAL ausente" });
      continue;
    }

    const ubigeoRaw = toText(raw["UBIGEO"]);
    const ubigeo = ubigeoRaw && /^\d{6}$/.test(ubigeoRaw) ? ubigeoRaw : null;

    const ambitoRaw = toText(raw["TXAMBITO"]);
    const ambito = ambitoRaw && AMBITOS.has(ambitoRaw.toUpperCase()) ? ambitoRaw.toUpperCase() : null;

    const generoRaw = toText(raw["TXGENERO"]);
    const genero = generoRaw && GENEROS.has(generoRaw.toUpperCase()) ? generoRaw.toUpperCase() : null;

    rows.push({
      nombres,
      apellidoPaterno,
      apellidoMaterno: toText(raw["TXAPELLIDOMATERNO"]),
      organizacionPolitica,
      posicion: toInt(raw["NUPOSICION"]),
      cargo,
      region: toText(raw["TXREGION"]),
      provincia: toText(raw["TXPROVINCIA"]),
      distrito: toText(raw["TXDISTRITO"]),
      ubigeo,
      fechaInicioVigencia: toDateOnly(raw["FEINICIOVIGENCIA"]),
      fechaFinVigencia: toDateOnly(raw["FEFINVIGENCIA"]),
      procesoElectoral,
      anioEleccion: toInt(raw["TXANIOELECCION"]),
      pronunciamiento: toText(raw["TXPRONUNCIAMIENTO"]),
      fechaPublicacion: toTimestamp(raw["FEPUBLICACION"]),
      ambito,
      genero,
      edad: toInt(raw["NUEDAD"]),
      periodo: toText(raw["TXPERIODO"]),
      tipoOrganizacion: toText(raw["TXTIPOORGPOLITICA"]),
    });
  }

  return { rows, rejected };
}
