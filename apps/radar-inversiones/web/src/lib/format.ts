const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

export function formatSoles(value: number | null): string {
  if (value === null) return "sin dato";
  return currencyFormatter.format(value);
}

export function formatFecha(isoDate: string | null): string {
  if (!isoDate) return "sin fecha";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}

/**
 * "Costo actualizado superior al costo inicial publicado, presentado como
 * variación de registro, no como irregularidad" — señal defendible tal cual
 * la define el documento fuente (sección 7). Solo se calcula cuando ambos
 * montos existen; nunca infiere sobre datos faltantes.
 */
export function variacionCostoPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable <= 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 1000) / 10;
}
