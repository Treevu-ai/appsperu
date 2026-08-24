import { buildUbigeo, type MefFieldMapping } from "./field-mapping.js";

export interface CanonicalBudgetRow {
  entityCode: string;
  entityName: string;
  nivelGobierno: string;
  funcion: string;
  generica: string | null;
  genericaNombre: string | null;
  ubigeo: string | null;
  departamentoNombre: string | null;
  provinciaNombre: string | null;
  distritoNombre: string | null;
  anioFiscal: number;
  pia: number;
  pim: number;
  devengado: number;
}

export interface RejectedRow {
  raw: Record<string, unknown>;
  reason: string;
}

export interface NormalizeResult {
  rows: CanonicalBudgetRow[];
  rejected: RejectedRow[];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Transforma filas crudas del MEF al modelo canónico, agregando por
 * (entity_code, funcion, anio_fiscal). El CSV real viene a nivel de línea de
 * clasificador de gasto (específica/subespecífica) — hay muchas filas por
 * combinación entidad+función+año, y deben sumarse, no tratarse como
 * duplicados a descartar. Una fila individual mala se aísla en `rejected`
 * con su motivo (FTS-011); nunca se lanza por una fila.
 */
export function normalizeMefRows(
  rawRows: Record<string, unknown>[],
  mapping: MefFieldMapping
): NormalizeResult {
  const rejected: RejectedRow[] = [];
  const aggregates = new Map<string, CanonicalBudgetRow>();

  for (const raw of rawRows) {
    const entityCode = raw[mapping.entityCode];
    const anioFiscal = toNumber(raw[mapping.anioFiscal]);
    const pia = toNumber(raw[mapping.pia]);
    const pim = toNumber(raw[mapping.pim]);
    const devengado = toNumber(raw[mapping.devengado]);
    const funcion = raw[mapping.funcion];

    if (typeof entityCode !== "string" || entityCode.trim() === "") {
      rejected.push({ raw, reason: "entity_code ausente o vacío" });
      continue;
    }
    if (typeof funcion !== "string" || funcion.trim() === "") {
      rejected.push({ raw, reason: "funcion ausente o vacía" });
      continue;
    }
    if (anioFiscal === null) {
      rejected.push({ raw, reason: "anio_fiscal no numérico" });
      continue;
    }
    if (pia === null || pim === null || devengado === null) {
      rejected.push({ raw, reason: "PIA/PIM/devengado no numérico" });
      continue;
    }

    const generica = String(raw[mapping.generica] ?? "").trim() || null;
    const key = `${entityCode}|${funcion}|${generica ?? ""}|${anioFiscal}`;
    const existing = aggregates.get(key);

    if (existing) {
      existing.pia += pia;
      existing.pim += pim;
      existing.devengado += devengado;
      continue;
    }

    aggregates.set(key, {
      entityCode: entityCode.trim(),
      entityName: String(raw[mapping.entityName] ?? "").trim() || entityCode.trim(),
      nivelGobierno: String(raw[mapping.nivelGobierno] ?? "").trim() || "NO_ESPECIFICADO",
      funcion: funcion.trim(),
      generica,
      genericaNombre: String(raw[mapping.genericaNombre] ?? "").trim() || null,
      ubigeo: buildUbigeo(
        raw[mapping.departamentoCodigo],
        raw[mapping.provinciaCodigo],
        raw[mapping.distritoCodigo]
      ),
      departamentoNombre: String(raw[mapping.departamentoNombre] ?? "").trim() || null,
      provinciaNombre: String(raw[mapping.provinciaNombre] ?? "").trim() || null,
      distritoNombre: String(raw[mapping.distritoNombre] ?? "").trim() || null,
      anioFiscal,
      pia,
      pim,
      devengado,
    });
  }

  const rows: CanonicalBudgetRow[] = [];
  for (const row of aggregates.values()) {
    if (row.pim > 0 && row.devengado / row.pim > 1.5) {
      // Devengado muy por encima del PIM agregado es señal de dato corrupto.
      rejected.push({
        raw: row as unknown as Record<string, unknown>,
        reason: "devengado agregado excede PIM en más de 50%: posible dato inválido",
      });
      continue;
    }
    rows.push(row);
  }

  return { rows, rejected };
}

export interface CanonicalProyectoRow {
  entityCode: string;
  funcion: string;
  generica: string | null;
  proyectoNombre: string;
  programaPptoNombre: string | null;
  anioFiscal: number;
  pia: number;
  pim: number;
  devengado: number;
}

export interface NormalizeProyectosResult {
  rows: CanonicalProyectoRow[];
  rejected: RejectedRow[];
}

/**
 * Igual espíritu que `normalizeMefRows` pero agregando por
 * (entity_code, funcion, generica, proyecto) en vez de solo
 * (entity_code, funcion, generica) — el nivel de detalle que responde "qué
 * construye" una entidad, no solo "cuánto gasta en qué función" (ver
 * ADR-0006, hallazgo de los nombres reales de proyecto de ANIN). Solo
 * agrega PIA, PIM y `devengado` por actividad reportada por el MEF. PIA/PIM
 * viven en las filas MES_EJE=0 y el devengado en los meses de ejecución;
 * cuando el nombre de actividad no aparece en la fila MES_EJE=0, el PIM de
 * esa actividad queda en cero. Esa ausencia se expone como "no atribuible",
 * no se reparte el PIM agregado de la entidad entre actividades por heurística.
 */
export function normalizeMefProyectos(
  rawRows: Record<string, unknown>[],
  mapping: MefFieldMapping
): NormalizeProyectosResult {
  const rejected: RejectedRow[] = [];
  const aggregates = new Map<string, CanonicalProyectoRow>();

  for (const raw of rawRows) {
    const entityCode = raw[mapping.entityCode];
    const anioFiscal = toNumber(raw[mapping.anioFiscal]);
    const pia = toNumber(raw[mapping.pia]);
    const pim = toNumber(raw[mapping.pim]);
    const devengado = toNumber(raw[mapping.devengado]);
    const funcion = raw[mapping.funcion];
    const proyectoNombre = String(raw[mapping.proyectoNombre] ?? "").trim();

    if (typeof entityCode !== "string" || entityCode.trim() === "") {
      rejected.push({ raw, reason: "entity_code ausente o vacío" });
      continue;
    }
    if (typeof funcion !== "string" || funcion.trim() === "") {
      rejected.push({ raw, reason: "funcion ausente o vacía" });
      continue;
    }
    if (anioFiscal === null) {
      rejected.push({ raw, reason: "anio_fiscal no numérico" });
      continue;
    }
    if (pia === null || pim === null || devengado === null) {
      rejected.push({ raw, reason: "PIA/PIM/devengado no numérico" });
      continue;
    }
    if (proyectoNombre === "") {
      rejected.push({ raw, reason: "ACTIVIDAD_ACCION_OBRA_NOMBRE ausente o vacío" });
      continue;
    }

    const generica = String(raw[mapping.generica] ?? "").trim() || null;
    const key = `${entityCode}|${funcion}|${generica ?? ""}|${proyectoNombre}|${anioFiscal}`;
    const existing = aggregates.get(key);

    if (existing) {
      existing.pia += pia;
      existing.pim += pim;
      existing.devengado += devengado;
      continue;
    }

    aggregates.set(key, {
      entityCode: entityCode.trim(),
      funcion: funcion.trim(),
      generica,
      proyectoNombre,
      programaPptoNombre: String(raw[mapping.programaPptoNombre] ?? "").trim() || null,
      anioFiscal,
      pia,
      pim,
      devengado,
    });
  }

  return { rows: [...aggregates.values()], rejected };
}

export function avancePct(row: Pick<CanonicalBudgetRow, "pim" | "devengado">): number | null {
  if (row.pim <= 0) return null;
  return Math.round((row.devengado / row.pim) * 10000) / 100;
}
