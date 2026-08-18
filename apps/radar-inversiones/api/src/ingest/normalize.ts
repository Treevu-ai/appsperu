/**
 * Columnas confirmadas el 2026-08-17 contra el diccionario oficial
 * (Detalle_Inversiones_Diccionario.csv) y una fila real de muestra del CSV
 * (ver docs/data-contracts/invierte-detalle-inversiones.md). A diferencia
 * del CSV de presupuesto del MEF, esta fuente ya viene una fila por
 * inversión — no requiere agregación.
 */

export interface CanonicalInvestmentRow {
  cui: string;
  codigoSnip: string | null;
  nombre: string;
  secEjec: string | null;
  nombreUep: string | null;
  entidad: string | null;
  sector: string | null;
  nivel: string | null;
  estado: string | null;
  situacion: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  montoViable: number | null;
  costoActualizado: number | null;
  funcion: string | null;
  tipoInversion: string | null;
  fechaRegistro: string | null;
  fechaViabilidad: string | null;
}

export interface RejectedInvestment {
  raw: Record<string, unknown>;
  reason: string;
}

export interface NormalizeResult {
  rows: CanonicalInvestmentRow[];
  rejected: RejectedInvestment[];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Transforma filas crudas del CSV de inversiones al modelo canónico. Cada
 * fila ya representa una inversión (CUI) — no hay agregación, a diferencia
 * del conector de presupuesto. Una fila individual mala se aísla en
 * `rejected` con su motivo; nunca se lanza por una fila.
 */
export function normalizeInvestmentRows(rawRows: Record<string, unknown>[]): NormalizeResult {
  const rows: CanonicalInvestmentRow[] = [];
  const rejected: RejectedInvestment[] = [];
  const seenCui = new Set<string>();

  for (const raw of rawRows) {
    const cui = toText(raw["CODIGO_UNICO"]);
    const nombre = toText(raw["NOMBRE_INVERSION"]);

    if (!cui) {
      rejected.push({ raw, reason: "CODIGO_UNICO (CUI) ausente" });
      continue;
    }
    if (!nombre) {
      rejected.push({ raw, reason: "NOMBRE_INVERSION ausente" });
      continue;
    }
    if (seenCui.has(cui)) {
      rejected.push({ raw, reason: `CUI duplicado dentro del mismo lote: ${cui}` });
      continue;
    }
    seenCui.add(cui);

    rows.push({
      cui,
      codigoSnip: toText(raw["CODIGO_SNIP"]),
      nombre,
      secEjec: toText(raw["SEC_EJEC"]),
      nombreUep: toText(raw["NOMBRE_UEP"]),
      entidad: toText(raw["ENTIDAD"]),
      sector: toText(raw["SECTOR"]),
      nivel: toText(raw["NIVEL"]),
      estado: toText(raw["ESTADO"]),
      situacion: toText(raw["SITUACION"]),
      ubigeo: toText(raw["UBIGEO"]),
      departamento: toText(raw["DEPARTAMENTO"]),
      provincia: toText(raw["PROVINCIA"]),
      distrito: toText(raw["DISTRITO"]),
      montoViable: toNumber(raw["MONTO_VIABLE"]),
      costoActualizado: toNumber(raw["COSTO_ACTUALIZADO"]),
      funcion: toText(raw["FUNCION"]),
      tipoInversion: toText(raw["TIPO_INVERSION"]),
      fechaRegistro: toText(raw["FECHA_REGISTRO"]),
      fechaViabilidad: toText(raw["FECHA_VIABILIDAD"]),
    });
  }

  return { rows, rejected };
}
