import { createHash } from "node:crypto";

/**
 * Normaliza filas del RUIAS (OEFA). La fuente real representa valores ausentes con el
 * literal "-" (no celda vacía), usa coma como separador decimal en montos, y codifica fechas
 * como enteros AAAAMMDD. `id_doc_administrado` se enmascara cuando `tipo_doc = 'D.N.I.'` — ver
 * el comentario de alcance en `db/migrations/001_init.sql`.
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

function toInt(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Fuente real: fechas como entero AAAAMMDD (ej. 20230518), no texto con separadores. */
function toDateFromYYYYMMDD(value: unknown): string | null {
  const text = toText(value);
  if (!text || !/^\d{8}$/.test(text)) return null;
  const yyyy = text.slice(0, 4);
  const mm = text.slice(4, 6);
  const dd = text.slice(6, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function maskDni(value: string): string {
  if (value.length <= 3) return value;
  return "*".repeat(value.length - 3) + value.slice(-3);
}

export interface CanonicalInfraccion {
  tipoDoc: string | null;
  idDocAdministrado: string | null;
  idDocEnmascarado: boolean;
  nombreAdministrado: string;
  unidadFiscalizable: string | null;
  subsectorEconomico: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  nroExpediente: string;
  nroRd: string | null;
  fechaRd: string | null;
  fechaInicioSup: string | null;
  fechaFinSup: string | null;
  nroRdMulta: string | null;
  fechaRdMulta: string | null;
  detalleInfraccion: string | null;
  normaTipificadora: string | null;
  tipoSancion: string | null;
  tipoInfraccion: string | null;
  medidaDictada: string | null;
  cantidadMulta: number | null;
  cantidadInfracciones: number | null;
  multaExpediente: number | null;
  fechaCorte: string | null;
  rowHash: string;
}

export interface NormalizeInfraccionesResult {
  rows: CanonicalInfraccion[];
  rejected: RejectedRow[];
}

export function normalizeInfracciones(rawRows: Record<string, unknown>[]): NormalizeInfraccionesResult {
  const rows: CanonicalInfraccion[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const nombreAdministrado = toText(raw["NOMBRE_ADMINISTRADO"]);
    const nroExpediente = toText(raw["NRO_EXPEDIENTE"]);

    if (!nombreAdministrado) {
      rejected.push({ raw, reason: "NOMBRE_ADMINISTRADO ausente" });
      continue;
    }
    if (!nroExpediente) {
      rejected.push({ raw, reason: "NRO_EXPEDIENTE ausente" });
      continue;
    }

    const tipoDoc = toText(raw["TIPO_DOC"]);
    const idDocRaw = toText(raw["ID_DOC_ADMINISTRADO"]);
    const isDni = tipoDoc?.toUpperCase().replace(/\./g, "") === "DNI";
    const idDocAdministrado = idDocRaw && isDni ? maskDni(idDocRaw) : idDocRaw;

    const nroRd = toText(raw["NRO_RD"]);
    const detalleInfraccion = toText(raw["DETALLE_INFRACCION"]);
    const tipoInfraccion = toText(raw["TIPO_INFRACCION"]);
    const medidaDictada = toText(raw["MEDIDA_DICTADA"]);
    const cantidadMulta = toDecimal(raw["CANTIDAD_MULTA"]);

    const rowHash = createHash("sha256")
      .update([nroExpediente, nroRd, detalleInfraccion, tipoInfraccion, medidaDictada, cantidadMulta].join("|"))
      .digest("hex");

    rows.push({
      tipoDoc,
      idDocAdministrado,
      idDocEnmascarado: Boolean(isDni && idDocRaw),
      nombreAdministrado,
      unidadFiscalizable: toText(raw["NOMBRE_UNIDAD_FISCALIZABLE"]),
      subsectorEconomico: toText(raw["SUBSECTOR_ECONOMICO"]),
      departamento: toText(raw["DEPARTAMENTO"]),
      provincia: toText(raw["PROVINCIA"]),
      distrito: toText(raw["DISTRITO"]),
      nroExpediente,
      nroRd,
      fechaRd: toDateFromYYYYMMDD(raw["FECHA_RD"]),
      fechaInicioSup: toDateFromYYYYMMDD(raw["FECHA_INICIO_SUP"]),
      fechaFinSup: toDateFromYYYYMMDD(raw["FECHA_FIN_SUP"]),
      nroRdMulta: toText(raw["NRO_RD_MULTA"]),
      fechaRdMulta: toDateFromYYYYMMDD(raw["FECHA_RD_MULTA"]),
      detalleInfraccion,
      normaTipificadora: toText(raw["NORMA_TIPIFICADORA"]),
      tipoSancion: toText(raw["TIPO_SANCION"]),
      tipoInfraccion,
      medidaDictada,
      cantidadMulta,
      cantidadInfracciones: toInt(raw["CANTIDAD_INFRACCIONES"]),
      multaExpediente: toDecimal(raw["MULTA_EXPEDIENTE"]),
      fechaCorte: toDateFromYYYYMMDD(raw["FECHA_CORTE"]),
      rowHash,
    });
  }

  return { rows, rejected };
}
