/**
 * Normaliza filas de "Matriculación y Trayectoria Estudiantil" (SIAGIE/MINEDU).
 *
 * Agregado por servicio educativo (código modular) -- no hay alumno individual en la fuente,
 * sin PII de estudiantes que excluir (a diferencia del Padrón Web, ver `normalize.ts`).
 */

import type { RejectedRow } from "./normalize.js";

export type { RejectedRow };

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number {
  const text = toText(value);
  if (text === null) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toIntOrNull(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export interface CanonicalTrayectoria {
  anio: number;
  codMod: string;
  anexo: string;
  nombre: string | null;
  gestion: string | null;
  idNivel: string | null;
  dscNivel: string | null;
  edad: number | null;
  tipoDiscaIntegrada: string;
  totalEstudiantes: number;
  discapacidad: number;
  mujer: number;
  hombre: number;
  venezolanos: number;
  peruanos: number;
  extranjeros: number;
  dniValidado: number;
  dniSinValidar: number;
  noDni: number;
  aprobado: number;
  desaprobado: number | null;
  promocionGuiada: number | null;
  retirado: number;
  fallecido: number;
  requiereRecuperacion: number;
  matriculado: number;
  postergaEvaluacion: number;
  totAtraso: number;
}

export interface NormalizeTrayectoriaResult {
  rows: CanonicalTrayectoria[];
  rejected: RejectedRow[];
}

/**
 * `anio` no viene en el CSV (un archivo por año) -- se inyecta desde el connector, que lo saca
 * del nombre del recurso descargado, no de una columna de la fuente.
 */
export function normalizeTrayectoria(rawRows: Record<string, unknown>[], anio: number): NormalizeTrayectoriaResult {
  const rows: CanonicalTrayectoria[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const codMod = toText(raw["cod_mod"]);
    const anexo = toText(raw["anexo"]);

    if (!codMod) {
      rejected.push({ raw, reason: "cod_mod ausente" });
      continue;
    }
    if (!anexo) {
      rejected.push({ raw, reason: "anexo ausente" });
      continue;
    }

    rows.push({
      anio,
      codMod,
      anexo,
      nombre: toText(raw["Nombre"]),
      gestion: toText(raw["gestion"]),
      idNivel: toText(raw["id_nivel"]),
      dscNivel: toText(raw["dsc_nivel"]),
      edad: toIntOrNull(raw["Edad"]),
      // Normalizado a '' (no NULL): mismo cod_mod/anexo/nivel/edad puede repetirse una vez sin
      // discapacidad y otra vez por cada tipo de discapacidad integrada distinta -- ver
      // comentario de clave natural en 002_siagie_trayectoria.sql.
      tipoDiscaIntegrada: toText(raw["TipoDiscaIntegrada"]) ?? "",
      totalEstudiantes: toInt(raw["TotalEstudiantes"]),
      discapacidad: toInt(raw["Discapacidad"]),
      mujer: toInt(raw["Mujer"]),
      hombre: toInt(raw["Hombre"]),
      venezolanos: toInt(raw["Venezolanos"]),
      peruanos: toInt(raw["Peruanos"]),
      extranjeros: toInt(raw["Extranjeros"]),
      dniValidado: toInt(raw["DNI_validado"]),
      dniSinValidar: toInt(raw["DNI_SinValidar"]),
      noDni: toInt(raw["No_DNI"]),
      aprobado: toInt(raw["Aprobado"]),
      // Desvío de esquema real entre años -- ver comentario en la migración. Cada fila solo
      // trae una de las dos columnas según el año de origen; la otra queda NULL (no 0, que
      // significaría "cero estudiantes" en vez de "esta columna no existía ese año").
      desaprobado: raw["Desaprobado"] === undefined ? null : toIntOrNull(raw["Desaprobado"]),
      promocionGuiada: raw["PromocionGuiada"] === undefined ? null : toIntOrNull(raw["PromocionGuiada"]),
      retirado: toInt(raw["Retirado"]),
      fallecido: toInt(raw["Fallecido"]),
      requiereRecuperacion: toInt(raw["RequiereRecuperacion"]),
      matriculado: toInt(raw["Matriculado"]),
      postergaEvaluacion: toInt(raw["PostergaEvaluacion"]),
      totAtraso: toInt(raw["tot_atraso"]),
    });
  }

  return { rows, rejected };
}
