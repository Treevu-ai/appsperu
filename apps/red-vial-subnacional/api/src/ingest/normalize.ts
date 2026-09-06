import { createHash } from "node:crypto";

/**
 * Normaliza filas de "Intervenciones en Redes Viales Subnacionales" (Provías Descentralizado).
 * La fuente real representa valores ausentes con el literal "-" y usa encoding Latin-1 (el
 * conector decodifica el buffer, no este módulo). Los nombres de columna traen espacios
 * irregulares (" CONVENIO", "CORREDOR VIAL ALIMENTADOR") — se acceden por bracket notation.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" || s === "-" ? null : s;
}

function toDecimal(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Fuente real: fechas como entero AAAAMMDD (ej. 20260630). */
function toDateFromYYYYMMDD(value: unknown): string | null {
  const text = toText(value);
  if (!text || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export interface CanonicalIntervencion {
  idIntervencion: string | null;
  codigoUnicoInversion: string | null;
  jerarquia: string | null;
  codigoRuta: string | null;
  trayectoria: string | null;
  inicioKm: string | null;
  finalKm: string | null;
  idDepartamento: string | null;
  idProvincia: string | null;
  departamento: string;
  provincia: string;
  estado: string | null;
  superficie: string | null;
  convenio: string | null;
  longitudKm: number | null;
  responsable: string | null;
  componente: string | null;
  corredorVial: string | null;
  nivelIntervencion: string | null;
  tramo: string | null;
  fechaCorte: string | null;
  rowHash: string;
}

export interface NormalizeIntervencionesResult {
  rows: CanonicalIntervencion[];
  rejected: RejectedRow[];
}

export function normalizeIntervenciones(rawRows: Record<string, unknown>[]): NormalizeIntervencionesResult {
  const rows: CanonicalIntervencion[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const departamento = toText(raw["DEPARTAMENTO"]);
    const provincia = toText(raw["PROVINCIA"]);
    const codigoRuta = toText(raw["CODIGO_RUTA"]);

    if (!departamento) {
      rejected.push({ raw, reason: "DEPARTAMENTO ausente" });
      continue;
    }
    if (!provincia) {
      rejected.push({ raw, reason: "PROVINCIA ausente" });
      continue;
    }

    const idIntervencion = toText(raw["ID_INTERVENCION"]);
    const tramo = toText(raw["TRAMO"]);
    const inicioKm = toText(raw["INICIO"]);
    const finalKm = toText(raw["FINAL"]);

    const rowHash = createHash("sha256")
      .update([idIntervencion, codigoRuta, tramo, inicioKm, finalKm, departamento, provincia].join("|"))
      .digest("hex");

    rows.push({
      idIntervencion,
      codigoUnicoInversion: toText(raw["CODIGO_UNICO_INVERSION"]),
      jerarquia: toText(raw["JERARQUIA"]),
      codigoRuta,
      trayectoria: toText(raw["TRAYECTORIA"]),
      inicioKm,
      finalKm,
      idDepartamento: toText(raw["IDDPTO"]),
      idProvincia: toText(raw["IDPROV"]),
      departamento,
      provincia,
      estado: toText(raw["ESTADO"]),
      superficie: toText(raw["SUPERFICIE"]),
      convenio: toText(raw[" CONVENIO"]),
      longitudKm: toDecimal(raw["LONGITUD"]),
      responsable: toText(raw["RESPONSABLE"]),
      componente: toText(raw["COMPONENTE"]),
      corredorVial: toText(raw["CORREDOR VIAL ALIMENTADOR"]),
      nivelIntervencion: toText(raw["NIVEL_INTERVENCION"]),
      tramo,
      fechaCorte: toDateFromYYYYMMDD(raw["FECHA_CORTE"]),
      rowHash,
    });
  }

  return { rows, rejected };
}
