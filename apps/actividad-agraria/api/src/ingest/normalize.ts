const MONTH_COLUMNS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Oct",
  "Nov",
  "Dic",
] as const;

export interface RawRegionalMonthlyRow {
  Región: string;
  Año: string;
  [month: string]: string;
}

export interface NormalizedRegionalMonthlyRow {
  departamento: string;
  anio: number;
  mes: number;
  valorSoles: number | null;
}

/** @deprecated usar RawRegionalMonthlyRow */
export type RawWageRow = RawRegionalMonthlyRow;
/** @deprecated usar NormalizedRegionalMonthlyRow */
export type NormalizedWageRow = NormalizedRegionalMonthlyRow;

export function isRejectedRegionalRow(raw: RawRegionalMonthlyRow): boolean {
  return !raw["Región"]?.trim() || !Number.isInteger(Number(raw["Año"]));
}

/** @deprecated usar isRejectedRegionalRow */
export const isRejected = isRejectedRegionalRow;

/**
 * Aplana una fila (Región, Año, Ene..Dic) en hasta 12 filas (departamento,
 * año, mes, valor). Dos marcadores de "sin valor" en el origen — `-` y campo
 * vacío — se normalizan igual a NULL.
 */
export function normalizeRegionalMonthlyRow(raw: RawRegionalMonthlyRow): NormalizedRegionalMonthlyRow[] {
  const departamento = raw["Región"].trim().toUpperCase();
  const anio = Number(raw["Año"]);

  return MONTH_COLUMNS.map((mesNombre, index) => {
    const rawValue = raw[mesNombre]?.trim().replace(",", ".") ?? "";
    const valorSoles = rawValue === "" || rawValue === "-" ? null : Number(rawValue);
    return {
      departamento,
      anio,
      mes: index + 1,
      valorSoles: valorSoles !== null && Number.isFinite(valorSoles) ? valorSoles : null,
    };
  });
}

/** @deprecated usar normalizeRegionalMonthlyRow */
export const normalizeRow = normalizeRegionalMonthlyRow;
