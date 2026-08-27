/**
 * Columnas reales del dataset SIDPOL - Denuncias Policiales (MININTER, vía
 * datosabiertos.gob.pe), confirmadas en vivo el 2026-08-27 contra el CSV
 * real (no la previsualización del portal):
 *
 *   ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad
 *
 * Cada fila es un conteo ya agregado (denuncias de una modalidad, en un
 * distrito, mes y año) — no hay caso individual en esta fuente.
 */
export interface RawPoliceReportRow {
  ANIO: string;
  MES: string;
  DPTO_HECHO_NEW: string;
  PROV_HECHO: string;
  DIST_HECHO: string;
  UBIGEO_HECHO: string;
  P_MODALIDADES: string;
  cantidad: string;
}

export interface NormalizedPoliceReport {
  anio: number;
  mes: number;
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  modalidad: string;
  cantidad: number;
}

export interface RejectedRow {
  raw: RawPoliceReportRow;
  reason: string;
}

/**
 * `UBIGEO_HECHO` viene sin cero inicial para los departamentos 01-09
 * (confirmado en vivo: "10202" para Amazonas/Bagua/Aramango, que en UBIGEO
 * estándar de 6 dígitos es "010202"). Se rellena a 6 dígitos solo cuando el
 * valor trae 5 — un valor de 6 dígitos ya está completo (departamentos 10+,
 * incluida LA LIBERTAD = 13, nunca pierden el cero).
 */
function normalizeUbigeo(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  if (/^\d{5}$/.test(trimmed)) return `0${trimmed}`;
  return null;
}

export function isRejected(raw: RawPoliceReportRow): boolean {
  const anio = Number(raw.ANIO);
  const mes = Number(raw.MES);
  const cantidad = Number(raw.cantidad);
  return (
    !raw.DPTO_HECHO_NEW?.trim() ||
    !raw.PROV_HECHO?.trim() ||
    !raw.DIST_HECHO?.trim() ||
    !raw.P_MODALIDADES?.trim() ||
    !Number.isInteger(anio) ||
    !Number.isInteger(mes) ||
    mes < 1 ||
    mes > 12 ||
    !Number.isInteger(cantidad) ||
    cantidad < 0 ||
    normalizeUbigeo(raw.UBIGEO_HECHO ?? "") === null
  );
}

export function normalizeRow(raw: RawPoliceReportRow): NormalizedPoliceReport {
  const ubigeo = normalizeUbigeo(raw.UBIGEO_HECHO);
  if (ubigeo === null) {
    throw new Error(`UBIGEO_HECHO inválido: "${raw.UBIGEO_HECHO}" — llamar isRejected() antes de normalizeRow().`);
  }
  return {
    anio: Number(raw.ANIO),
    mes: Number(raw.MES),
    departamento: raw.DPTO_HECHO_NEW.trim().toUpperCase(),
    provincia: raw.PROV_HECHO.trim().toUpperCase(),
    distrito: raw.DIST_HECHO.trim().toUpperCase(),
    ubigeo,
    modalidad: raw.P_MODALIDADES.trim(),
    cantidad: Number(raw.cantidad),
  };
}
