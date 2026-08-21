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

export interface RawWageRow {
  Región: string;
  Año: string;
  [month: string]: string;
}

export interface NormalizedWageRow {
  departamento: string;
  anio: number;
  mes: number;
  valorSoles: number | null;
}

export function isRejected(raw: RawWageRow): boolean {
  return !raw["Región"]?.trim() || !Number.isInteger(Number(raw["Año"]));
}

/**
 * Aplana una fila (Región, Año, Ene..Dic) en hasta 12 filas (departamento,
 * año, mes, valor). Dos marcadores de "sin valor" en el origen — `-` (mes
 * reportado sin dato, ej. La Libertad abr-jul 2020) y campo vacío (mes
 * futuro aún no reportado, ej. el resto de 2026 tras febrero) — se
 * normalizan igual, ambos a NULL (ver ADR-0008 y el data contract de MIDAGRI).
 */
export function normalizeRow(raw: RawWageRow): NormalizedWageRow[] {
  const departamento = raw["Región"].trim().toUpperCase();
  const anio = Number(raw["Año"]);

  return MONTH_COLUMNS.map((mesNombre, index) => {
    const rawValue = raw[mesNombre]?.trim() ?? "";
    const valorSoles = rawValue === "" || rawValue === "-" ? null : Number(rawValue);
    return {
      departamento,
      anio,
      mes: index + 1,
      valorSoles: valorSoles !== null && Number.isFinite(valorSoles) ? valorSoles : null,
    };
  });
}
