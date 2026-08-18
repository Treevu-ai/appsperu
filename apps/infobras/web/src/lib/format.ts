const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

export function formatSoles(value: number | null): string {
  if (value === null) return "sin dato";
  return currencyFormatter.format(value);
}

export function formatPct(value: number | null): string {
  if (value === null) return "sin dato";
  return `${value.toFixed(1)}%`;
}

export function variacionCostoPct(montoViable: number | null, costoActualizado: number | null): number | null {
  if (montoViable === null || costoActualizado === null || montoViable <= 0) return null;
  return Math.round(((costoActualizado - montoViable) / montoViable) * 1000) / 10;
}

export function formatFecha(isoDate: string | null): string {
  if (!isoDate) return "sin fecha";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}
