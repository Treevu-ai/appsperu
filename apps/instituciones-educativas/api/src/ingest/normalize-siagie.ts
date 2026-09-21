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

/**
 * Un conteo ausente en la fuente es 0 estudiantes -- un conteo presente pero no numérico (ej.
 * "N/A") es un dato corrupto, no un 0. Antes esta función colapsaba ambos casos a 0 en
 * silencio; ahora distingue: "" -> 0 real, "N/A" -> `ok:false`, que el caller usa para rechazar
 * la fila en vez de persistir un 0 falso (hallazgo real de CodeRabbit en PR #178).
 */
function toCount(value: unknown): { ok: true; value: number } | { ok: false } {
  const text = toText(value);
  if (text === null) return { ok: true, value: 0 };
  const n = Number(text);
  return Number.isFinite(n) ? { ok: true, value: Math.trunc(n) } : { ok: false };
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
  idNivel: string;
  dscNivel: string | null;
  edad: number;
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

  const COUNT_FIELDS = [
    "TotalEstudiantes", "Discapacidad", "Mujer", "Hombre", "Venezolanos", "Peruanos",
    "Extranjeros", "DNI_validado", "DNI_SinValidar", "No_DNI", "Aprobado", "Retirado",
    "Fallecido", "RequiereRecuperacion", "Matriculado", "PostergaEvaluacion", "tot_atraso",
  ] as const;

  for (const raw of rawRows) {
    const codMod = toText(raw["cod_mod"]);
    const anexo = toText(raw["anexo"]);
    const idNivel = toText(raw["id_nivel"]);
    const edad = toIntOrNull(raw["Edad"]);

    if (!codMod) {
      rejected.push({ raw, reason: "cod_mod ausente" });
      continue;
    }
    if (!anexo) {
      rejected.push({ raw, reason: "anexo ausente" });
      continue;
    }
    // idNivel/edad son parte de la clave natural (ver 002_siagie_trayectoria.sql) -- si
    // cualquiera falta, el UNIQUE constraint (que trata NULL como siempre distinto) dejaría de
    // detectar duplicados reales entre reingestas. Solo 1 de 535,137 filas del CSV 2024 real
    // carece de Edad -- pérdida insignificante, verificado en vivo 2026-09-21.
    if (!idNivel) {
      rejected.push({ raw, reason: "id_nivel ausente" });
      continue;
    }
    if (edad === null) {
      rejected.push({ raw, reason: "Edad ausente o no numérica" });
      continue;
    }

    const counts: Record<string, number> = {};
    let invalidField: string | null = null;
    for (const field of COUNT_FIELDS) {
      const result = toCount(raw[field]);
      if (!result.ok) {
        invalidField = field;
        break;
      }
      counts[field] = result.value;
    }
    if (invalidField) {
      rejected.push({ raw, reason: `${invalidField} no es numérico` });
      continue;
    }

    rows.push({
      anio,
      codMod,
      anexo,
      nombre: toText(raw["Nombre"]),
      gestion: toText(raw["gestion"]),
      idNivel,
      dscNivel: toText(raw["dsc_nivel"]),
      edad,
      // Normalizado a '' (no NULL): mismo cod_mod/anexo/nivel/edad puede repetirse una vez sin
      // discapacidad y otra vez por cada tipo de discapacidad integrada distinta -- ver
      // comentario de clave natural en 002_siagie_trayectoria.sql.
      tipoDiscaIntegrada: toText(raw["TipoDiscaIntegrada"]) ?? "",
      totalEstudiantes: counts.TotalEstudiantes,
      discapacidad: counts.Discapacidad,
      mujer: counts.Mujer,
      hombre: counts.Hombre,
      venezolanos: counts.Venezolanos,
      peruanos: counts.Peruanos,
      extranjeros: counts.Extranjeros,
      dniValidado: counts.DNI_validado,
      dniSinValidar: counts.DNI_SinValidar,
      noDni: counts.No_DNI,
      aprobado: counts.Aprobado,
      // Desvío de esquema real entre años -- ver comentario en la migración. Cada fila solo
      // trae una de las dos columnas según el año de origen; la otra queda NULL (no 0, que
      // significaría "cero estudiantes" en vez de "esta columna no existía ese año").
      desaprobado: raw["Desaprobado"] === undefined ? null : toIntOrNull(raw["Desaprobado"]),
      promocionGuiada: raw["PromocionGuiada"] === undefined ? null : toIntOrNull(raw["PromocionGuiada"]),
      retirado: counts.Retirado,
      fallecido: counts.Fallecido,
      requiereRecuperacion: counts.RequiereRecuperacion,
      matriculado: counts.Matriculado,
      postergaEvaluacion: counts.PostergaEvaluacion,
      totAtraso: counts.tot_atraso,
    });
  }

  return { rows, rejected };
}
