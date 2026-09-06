/**
 * Columnas confirmadas el 2026-09-06 contra una fila real de
 * `INVERSIONES_DESACTIVADAS.csv` (ver
 * docs/data-contracts/invierte-inversiones-desactivadas.md). El diccionario
 * y los nombres de columna de este archivo NO coinciden con los de
 * `DETALLE_INVERSIONES.csv` (activo) — en particular `COD_SNIP` (no
 * `CODIGO_SNIP`), `NOM_UEP` (no `NOMBRE_UEP`), y **no existe `SEC_EJEC`**:
 * una inversión desactivada nunca llegó a tener código de ejecución
 * presupuestal, así que el cruce por `sec_ejec` contra radar-ejecucion no
 * aplica a este dataset — se deja siempre `null`, no es un dato faltante.
 */

export interface CanonicalDeactivatedInvestmentRow {
  cui: string;
  codigoSnip: string | null;
  nombre: string;
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
  numHabitantesBenef: number | null;
}

export interface RejectedDeactivatedInvestment {
  raw: Record<string, unknown>;
  reason: string;
}

export interface NormalizeDeactivatedResult {
  rows: CanonicalDeactivatedInvestmentRow[];
  rejected: RejectedDeactivatedInvestment[];
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
 * Transforma filas crudas de inversiones desactivadas al modelo canónico.
 * Una fila mala se aísla en `rejected` con su motivo; nunca se lanza por
 * una fila.
 */
export function normalizeDeactivatedInvestmentRows(
  rawRows: Record<string, unknown>[]
): NormalizeDeactivatedResult {
  const rows: CanonicalDeactivatedInvestmentRow[] = [];
  const rejected: RejectedDeactivatedInvestment[] = [];
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
      codigoSnip: toText(raw["COD_SNIP"]),
      nombre,
      nombreUep: toText(raw["NOM_UEP"]),
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
      numHabitantesBenef: toNumber(raw["NUM_HABITANTES_BENEF"]),
    });
  }

  return { rows, rejected };
}
